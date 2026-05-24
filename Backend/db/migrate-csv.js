/**
 * db/migrate-csv.js
 * -----------------
 * Imports aircraftDatabase.csv and airports.csv into PostgreSQL.
 *
 * Run: node db/migrate-csv.js
 *
 * Progress is printed every 10,000 rows.
 * Safe to re-run — uses ON CONFLICT DO NOTHING (idempotent).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parser');

// ── DB connection ──────────────────────────────────────────────────────────────
function parseDbUrl(rawUrl) {
  const u = new URL(rawUrl || 'postgresql://postgres:@localhost:5432/aerotwin');
  return {
    host:     u.hostname     || 'localhost',
    port:     Number(u.port) || 5432,
    user:     u.username     || 'postgres',
    password: u.password     || '',
    database: u.pathname.replace(/^\//, '') || 'aerotwin',
  };
}

const pool = new Pool({ ...parseDbUrl(process.env.DATABASE_URL), max: 5 });

// ── Batch INSERT helper ────────────────────────────────────────────────────────
async function batchInsert(client, sql, batchValues) {
  if (batchValues.length === 0) return 0;
  try {
    const result = await client.query(sql, batchValues);
    return result.rowCount || 0;
  } catch (err) {
    console.warn('  ⚠️  Batch insert warning:', err.message.split('\n')[0]);
    return 0;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function safe(val)    { return (val === '' || val == null) ? null : val; }
function safeNum(val) { const n = parseFloat(val); return isNaN(n) ? null : n; }
function safeInt(val) { const n = parseInt(val, 10); return isNaN(n) ? null : n; }

// ── 1. Migrate aircraftDatabase.csv → aircraft_registry ───────────────────────
async function migrateAircraft(client) {
  const filePath = path.join(__dirname, '..', 'aircraftDatabase.csv');
  if (!fs.existsSync(filePath)) {
    console.log('⚠️  aircraftDatabase.csv not found — skipping');
    return;
  }

  console.log('\n📦 Migrating aircraftDatabase.csv → aircraft_registry ...');

  // Create table if it doesn't exist yet
  await client.query(`
    CREATE TABLE IF NOT EXISTS aircraft_registry (
      icao24          TEXT    PRIMARY KEY,
      registration    TEXT,
      manufacturer    TEXT,
      model           TEXT,
      typecode        TEXT,
      operator        TEXT,
      operator_icao   TEXT,
      operator_iata   TEXT,
      owner           TEXT,
      built           TEXT,
      status          TEXT
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_aircraft_typecode ON aircraft_registry (typecode)`);

  const BATCH = 500;
  let rows = [], inserted = 0, skipped = 0, total = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const icao24 = safe(row.icao24);
        if (!icao24) { skipped++; return; }

        rows.push([
          icao24.toLowerCase(),
          safe(row.registration),
          safe(row.manufacturername),
          safe(row.model),
          safe(row.typecode),
          safe(row.operator),
          safe(row.operatoricao),
          safe(row.operatoriata),
          safe(row.owner),
          safe(row.built),
          safe(row.status),
        ]);
        total++;

        if (rows.length >= BATCH) {
          // Pause stream and flush
          const batch = rows.splice(0, BATCH);
          flushAircraft(client, batch)
            .then(n => { inserted += n; })
            .catch(() => {});
        }

        if (total % 10000 === 0) {
          process.stdout.write(`\r  → ${total.toLocaleString()} rows processed...`);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // Flush remaining
  if (rows.length > 0) {
    inserted += await flushAircraft(client, rows);
  }

  console.log(`\n✅ aircraft_registry: ${total.toLocaleString()} rows processed, ${inserted.toLocaleString()} inserted/updated, ${skipped} skipped (no icao24)`);
}

async function flushAircraft(client, rows) {
  // Build parameterised INSERT for the batch
  const cols = 11;
  const placeholders = rows.map((_, ri) =>
    `(${Array.from({ length: cols }, (__, ci) => `$${ri * cols + ci + 1}`).join(', ')})`
  ).join(', ');

  const sql = `
    INSERT INTO aircraft_registry
      (icao24, registration, manufacturer, model, typecode,
       operator, operator_icao, operator_iata, owner, built, status)
    VALUES ${placeholders}
    ON CONFLICT (icao24) DO NOTHING
  `;
  return batchInsert(client, sql, rows.flat());
}

// ── 2. Migrate airports.csv → airports_full ───────────────────────────────────
async function migrateAirports(client) {
  const filePath = path.join(__dirname, '..', 'airports.csv');
  if (!fs.existsSync(filePath)) {
    console.log('⚠️  airports.csv not found — skipping');
    return;
  }

  console.log('\n🛫 Migrating airports.csv → airports_full ...');

  await client.query(`
    CREATE TABLE IF NOT EXISTS airports_full (
      id              BIGINT  PRIMARY KEY,
      ident           TEXT,
      type            TEXT,
      name            TEXT,
      latitude        DOUBLE PRECISION,
      longitude       DOUBLE PRECISION,
      elevation_ft    INT,
      continent       TEXT,
      iso_country     TEXT,
      iso_region      TEXT,
      municipality    TEXT,
      scheduled_service TEXT,
      icao_code       TEXT,
      iata_code       TEXT,
      gps_code        TEXT,
      local_code      TEXT
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_airports_full_iata ON airports_full (iata_code)
    WHERE iata_code IS NOT NULL AND iata_code != ''
  `).catch(() => {}); // already exists is fine

  const BATCH = 500;
  let rows = [], inserted = 0, total = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const id = safeInt(row.id);
        if (!id) return;

        rows.push([
          id,
          safe(row.ident),
          safe(row.type),
          safe(row.name),
          safeNum(row.latitude_deg),
          safeNum(row.longitude_deg),
          safeInt(row.elevation_ft),
          safe(row.continent),
          safe(row.iso_country),
          safe(row.iso_region),
          safe(row.municipality),
          safe(row.scheduled_service),
          safe(row.icao_code),
          safe(row.iata_code),
          safe(row.gps_code),
          safe(row.local_code),
        ]);
        total++;

        if (rows.length >= BATCH) {
          const batch = rows.splice(0, BATCH);
          flushAirports(client, batch)
            .then(n => { inserted += n; })
            .catch(() => {});
        }

        if (total % 5000 === 0) {
          process.stdout.write(`\r  → ${total.toLocaleString()} rows processed...`);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  if (rows.length > 0) {
    inserted += await flushAirports(client, rows);
  }

  console.log(`\n✅ airports_full: ${total.toLocaleString()} rows processed, ${inserted.toLocaleString()} inserted/updated`);
}

async function flushAirports(client, rows) {
  const cols = 16;
  const placeholders = rows.map((_, ri) =>
    `(${Array.from({ length: cols }, (__, ci) => `$${ri * cols + ci + 1}`).join(', ')})`
  ).join(', ');

  const sql = `
    INSERT INTO airports_full
      (id, ident, type, name, latitude, longitude, elevation_ft,
       continent, iso_country, iso_region, municipality, scheduled_service,
       icao_code, iata_code, gps_code, local_code)
    VALUES ${placeholders}
    ON CONFLICT (id) DO NOTHING
  `;
  return batchInsert(client, sql, rows.flat());
}

// ── 3. Also seed `airports` table from airports_full (IATA lookup cache) ───────
async function seedAirportsCache(client) {
  console.log('\n🗺️  Seeding airports (IATA lookup cache) from airports_full ...');
  const result = await client.query(`
    INSERT INTO airports (iata_code, name, latitude, longitude, updated_at)
    SELECT
      iata_code,
      name,
      latitude,
      longitude,
      NOW()
    FROM airports_full
    WHERE iata_code IS NOT NULL
      AND iata_code != ''
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
    ON CONFLICT (iata_code) DO UPDATE
      SET name       = EXCLUDED.name,
          latitude   = EXCLUDED.latitude,
          longitude  = EXCLUDED.longitude,
          updated_at = NOW()
  `);
  console.log(`✅ airports (IATA cache): ${result.rowCount} rows upserted`);
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  const start = Date.now();

  try {
    await migrateAircraft(client);
    await migrateAirports(client);
    await seedAirportsCache(client);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n🎉 Migration complete in ${elapsed}s`);
    console.log('   Tables populated:');
    console.log('   • aircraft_registry  (icao24 → type/manufacturer/operator)');
    console.log('   • airports_full      (full OurAirports dataset)');
    console.log('   • airports           (IATA lookup cache, seeded from airports_full)');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
