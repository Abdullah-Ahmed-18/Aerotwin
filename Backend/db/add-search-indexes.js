/**
 * db/add-search-indexes.js
 * ------------------------
 * Adds PostgreSQL GIN (full-text search) indexes to airports_full
 * and aircraft_registry so /api/search runs fast on large datasets.
 *
 * Run once: node db/add-search-indexes.js
 * Safe to re-run — all indexes use IF NOT EXISTS.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

function parseDbUrl(rawUrl) {
  const u = new URL(rawUrl || 'postgresql://postgres:@localhost:5432/aerotwin');
  return {
    host: u.hostname || 'localhost', port: Number(u.port) || 5432,
    user: u.username || 'postgres',  password: u.password || '',
    database: u.pathname.replace(/^\//, '') || 'aerotwin',
  };
}

const pool = new Pool({ ...parseDbUrl(process.env.DATABASE_URL), max: 3 });

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔍 Building full-text search indexes...\n');

    // ── airports_full ────────────────────────────────────────────────────────
    console.log('  [1/3] airports_full — tsvector column + GIN index...');
    await client.query(`
      ALTER TABLE airports_full
        ADD COLUMN IF NOT EXISTS fts tsvector
          GENERATED ALWAYS AS (
            to_tsvector('simple',
              coalesce(name,'') || ' ' ||
              coalesce(iata_code,'') || ' ' ||
              coalesce(icao_code,'') || ' ' ||
              coalesce(municipality,'') || ' ' ||
              coalesce(iso_country,'') || ' ' ||
              coalesce(iso_region,'')
            )
          ) STORED
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_airports_full_fts
        ON airports_full USING GIN (fts)
    `);
    console.log('  ✅ airports_full GIN index ready');

    // ── aircraft_registry ────────────────────────────────────────────────────
    console.log('  [2/3] aircraft_registry — tsvector column + GIN index...');
    await client.query(`
      ALTER TABLE aircraft_registry
        ADD COLUMN IF NOT EXISTS fts tsvector
          GENERATED ALWAYS AS (
            to_tsvector('simple',
              coalesce(icao24,'') || ' ' ||
              coalesce(registration,'') || ' ' ||
              coalesce(manufacturer,'') || ' ' ||
              coalesce(model,'') || ' ' ||
              coalesce(typecode,'') || ' ' ||
              coalesce(operator,'') || ' ' ||
              coalesce(operator_icao,'') || ' ' ||
              coalesce(owner,'')
            )
          ) STORED
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_aircraft_registry_fts
        ON aircraft_registry USING GIN (fts)
    `);
    console.log('  ✅ aircraft_registry GIN index ready');

    // ── flight_snapshots ────────────────────────────────────────────────────
    console.log('  [3/3] flight_snapshots — GIN index on key columns...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fs_flight_iata_text
        ON flight_snapshots USING BTREE (flight_iata text_pattern_ops)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fs_airline_text
        ON flight_snapshots USING BTREE (airline text_pattern_ops)
    `);
    console.log('  ✅ flight_snapshots indexes ready');

    console.log('\n🎉 All search indexes built successfully!');
    console.log('   /api/search?q=<term>&type=all is now fast on all tables.');

  } catch (err) {
    // Generated columns may already exist — that's fine
    if (err.message.includes('already exists') || err.message.includes('duplicate column')) {
      console.log('  ℹ️  Some indexes/columns already exist — skipping duplicates');
    } else {
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('❌ Index build failed:', err.message);
  process.exit(1);
});
