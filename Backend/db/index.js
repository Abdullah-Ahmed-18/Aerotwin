/**
 * db/index.js
 * -----------
 * Thin wrapper around `pg` Pool for TimescaleDB / PostgreSQL.
 *
 * Usage:
 *   const db = require('./db');
 *   const rows = await db.query('SELECT * FROM airports WHERE iata_code = $1', ['HBE']);
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Parse DATABASE_URL into explicit params so pg handles empty passwords correctly
function parseDbUrl(rawUrl) {
  try {
    const u = new URL(rawUrl || 'postgresql://postgres:@localhost:5432/aerotwin');
    return {
      host:     u.hostname     || 'localhost',
      port:     Number(u.port) || 5432,
      user:     u.username     || 'postgres',
      password: u.password     || '',          // empty string = no password
      database: u.pathname.replace(/^\//,'')  || 'aerotwin',
    };
  } catch {
    return { host: 'localhost', port: 5432, user: 'postgres', password: '', database: 'aerotwin' };
  }
}

const dbParams = parseDbUrl(process.env.DATABASE_URL);

// ── Connection pool ────────────────────────────────────────────────────────────
const pool = new Pool({
  ...dbParams,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ [DB] Unexpected pool error:', err.message);
});

// ── Generic query helper ───────────────────────────────────────────────────────
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// ── Schema bootstrapper ────────────────────────────────────────────────────────
async function initDB() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  try {
    await query(schemaSql);
    console.log('✅ [DB] Schema initialised (TimescaleDB hypertables ready)');
  } catch (err) {
    console.error('❌ [DB] Schema initialisation failed:', err.message);
    throw err;
  }
}

// ── Airport helpers ────────────────────────────────────────────────────────────

/**
 * Load all airports from the DB into a plain object { iata_code → { code, name, coords } }.
 */
async function loadAllAirports() {
  try {
    const { rows } = await query('SELECT iata_code, name, latitude, longitude FROM airports');
    const result = {};
    for (const row of rows) {
      result[row.iata_code] = {
        code: row.iata_code,
        name: row.name,
        coords: [row.latitude, row.longitude],
      };
    }
    console.log(`✅ [DB] Loaded ${rows.length} airports from database`);
    return result;
  } catch (err) {
    console.warn('⚠️  [DB] Could not load airports from DB:', err.message);
    return {};
  }
}

/**
 * Upsert a single airport record.
 * @param {string} iataCode
 * @param {{ name: string, coords: [number, number] }} data
 */
async function upsertAirport(iataCode, data) {
  const [lat, lon] = data.coords || [null, null];
  try {
    await query(
      `INSERT INTO airports (iata_code, name, latitude, longitude, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (iata_code) DO UPDATE
         SET name = EXCLUDED.name,
             latitude = EXCLUDED.latitude,
             longitude = EXCLUDED.longitude,
             updated_at = NOW()`,
      [iataCode, data.name || iataCode, lat, lon]
    );
  } catch (err) {
    console.warn(`⚠️  [DB] Could not upsert airport ${iataCode}:`, err.message);
  }
}

// ── Flight snapshot helpers ────────────────────────────────────────────────────

/**
 * Bulk-insert an array of formatted flight objects into flight_snapshots.
 * Silently skips on error so the REST response is never blocked.
 *
 * @param {string} airport  IATA code of the queried airport
 * @param {object[]} flights  Formatted flight objects from /api/fetch-active-flights
 */
async function insertFlightSnapshots(airport, flights) {
  if (!Array.isArray(flights) || flights.length === 0) return;

  const now = new Date();
  const values = [];
  const placeholders = [];
  let idx = 1;

  for (const f of flights) {
    const live = f.opensky_live || {};
    const pax = parseInt(String(f.payload_stats?.total_passengers || '0'), 10) || null;

    placeholders.push(
      `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, ` +
      `$${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, ` +
      `$${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
    );
    values.push(
      now,
      airport,
      f.flight_iata || null,
      f.flight_icao || null,
      f.airline || null,
      f.airline_iata || null,
      f.flight_status || null,
      f.flight_type || null,
      f.route?.source || null,
      f.route?.destination || null,
      f.aircraft?.type || null,
      f.aircraft?.type_source || null,
      isNaN(pax) ? null : pax,
      live.on_ground ?? null,
      live.latitude ?? null,
      live.longitude ?? null,
      live.altitude_m ?? null,
      live.velocity_mps ?? null
    );
  }

  const sql = `
    INSERT INTO flight_snapshots
      (time, airport, flight_iata, flight_icao, airline, airline_iata,
       flight_status, flight_type, source_iata, dest_iata,
       aircraft_type, aircraft_source, estimated_pax, on_ground,
       latitude, longitude, altitude_m, velocity_mps)
    VALUES ${placeholders.join(', ')}
  `;

  try {
    await query(sql, values);
    console.log(`✅ [DB] Inserted ${flights.length} flight snapshots (airport: ${airport})`);
  } catch (err) {
    console.warn('⚠️  [DB] Failed to insert flight snapshots:', err.message);
  }
}

// ── Queue wait-time helpers ────────────────────────────────────────────────────

/**
 * Bulk-insert checkpoint queue estimates into queue_wait_times.
 *
 * @param {string} airport
 * @param {object[]} results  Array of CheckpointResult-like objects from the frontend model
 */
async function insertQueueSnapshot(airport, results) {
  if (!Array.isArray(results) || results.length === 0) return;

  const now = new Date();
  const values = [];
  const placeholders = [];
  let idx = 1;

  for (const r of results) {
    placeholders.push(
      `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, ` +
      `$${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
    );
    values.push(
      now,
      airport,
      r.checkpoint_id || r.checkpoint?.id || null,
      r.checkpoint_label || r.checkpoint?.label || null,
      r.checkpoint_type || r.checkpoint?.type || null,
      r.flow_type || 'departure',
      r.utilisation ?? null,
      r.queue_length != null ? Math.ceil(r.queue_length) : null,
      r.wait_secs != null ? Math.round(r.wait_secs) : null,
      r.arrival_rate ?? null,
      r.total_agents ?? null,
      r.status || null
    );
  }

  const sql = `
    INSERT INTO queue_wait_times
      (time, airport, checkpoint_id, checkpoint_label, checkpoint_type,
       flow_type, utilisation, queue_length, estimated_wait_s,
       arrival_rate, total_agents, status)
    VALUES ${placeholders.join(', ')}
  `;

  try {
    await query(sql, values);
    console.log(`✅ [DB] Inserted ${results.length} queue snapshots (airport: ${airport})`);
  } catch (err) {
    console.warn('⚠️  [DB] Failed to insert queue snapshots:', err.message);
  }
}

// ── User helpers ───────────────────────────────────────────────────────────────

/**
 * Create a new user. Returns the inserted row (without password_hash).
 */
async function createUser(username, fullName, email, passwordHash) {
  const { rows } = await query(
    `INSERT INTO users (username, full_name, email, password_hash)
     VALUES ($1, $2, LOWER($3), $4)
     RETURNING id, username, full_name, email, created_at, updated_at`,
    [username, fullName, email, passwordHash]
  );
  return rows[0];
}

/**
 * Find a user by username (exact, case-sensitive).
 */
async function findUserByUsername(username) {
  const { rows } = await query(
    `SELECT * FROM users WHERE username = $1`,
    [username]
  );
  return rows[0] || null;
}

/**
 * Find a user by email (case-insensitive).
 */
async function findUserByEmail(email) {
  const { rows } = await query(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  return rows[0] || null;
}

/**
 * Find a user by username OR email (for sign-in).
 */
async function findUserByUsernameOrEmail(identifier) {
  const { rows } = await query(
    `SELECT * FROM users WHERE username = $1 OR LOWER(email) = LOWER($1)`,
    [identifier]
  );
  return rows[0] || null;
}

/**
 * Find a user by id.
 */
async function findUserById(id) {
  const { rows } = await query(
    `SELECT id, username, full_name, email, created_at, updated_at FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Delete a user by id. Returns the deleted row (without password_hash) or null.
 */
async function deleteUserById(id) {
  const { rows } = await query(
    `DELETE FROM users WHERE id = $1
     RETURNING id, username, full_name, email, created_at, updated_at`,
    [id]
  );
  return rows[0] || null;
}

// ── Analytics query helpers ────────────────────────────────────────────────────

/**
 * Raw flight snapshot rows for a time window.
 */
async function getFlightSnapshots(airport, hoursBack = 24) {
  const { rows } = await query(
    `SELECT * FROM flight_snapshots
     WHERE airport = $1
       AND time > NOW() - ($2 || ' hours')::INTERVAL
     ORDER BY time DESC
     LIMIT 2000`,
    [airport, hoursBack]
  );
  return rows;
}

/**
 * Hourly flight status trend using TimescaleDB time_bucket.
 */
async function getStatusTrend(airport, hoursBack = 6) {
  const { rows } = await query(
    `SELECT
       time_bucket('1 hour', time) AS bucket,
       flight_status,
       COUNT(*)::INT AS count
     FROM flight_snapshots
     WHERE airport = $1
       AND time > NOW() - ($2 || ' hours')::INTERVAL
     GROUP BY bucket, flight_status
     ORDER BY bucket ASC`,
    [airport, hoursBack]
  );
  return rows;
}

/**
 * Queue wait history for all checkpoints at an airport.
 */
async function getQueueHistory(airport, hoursBack = 1) {
  const { rows } = await query(
    `SELECT
       time_bucket('5 minutes', time) AS bucket,
       checkpoint_id,
       checkpoint_label,
       checkpoint_type,
       ROUND(AVG(utilisation)::NUMERIC, 3)        AS avg_utilisation,
       ROUND(AVG(queue_length))::INT               AS avg_queue_length,
       ROUND(AVG(estimated_wait_s))::INT           AS avg_wait_s,
       MODE() WITHIN GROUP (ORDER BY status)       AS dominant_status
     FROM queue_wait_times
     WHERE airport = $1
       AND time > NOW() - ($2 || ' hours')::INTERVAL
     GROUP BY bucket, checkpoint_id, checkpoint_label, checkpoint_type
     ORDER BY bucket ASC, checkpoint_id`,
    [airport, hoursBack]
  );
  return rows;
}

/**
 * Full-text search across airports, aircraft, and flight history.
 *
 * @param {string} term   Raw search query (e.g. "egypt", "B738", "MS655")
 * @param {object} opts   { type: 'all'|'airports'|'aircraft'|'flights', limit: 20 }
 * @returns {{ airports, aircraft, flights, meta }}
 */
async function fullSearch(term, opts = {}) {
  const { type = 'all', limit = 20 } = opts;
  if (!term || term.trim().length < 2) return { airports: [], aircraft: [], flights: [], meta: { term, count: 0 } };

  const t  = term.trim();
  const q  = t.split(/\s+/).filter(Boolean).join(' & '); // for tsquery
  const lk = `%${t}%`;                                   // for ILIKE fallback
  const n  = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

  const searches = {};

  // ── Airports (airports_full — 85k rows, GIN indexed) ──────────────────────
  if (type === 'all' || type === 'airports') {
    searches.airports = query(
      `SELECT
         iata_code, icao_code, name, municipality,
         iso_country, iso_region, type,
         latitude, longitude, elevation_ft,
         ts_rank(fts, to_tsquery('simple', $2)) AS rank
       FROM airports_full
       WHERE fts @@ to_tsquery('simple', $2)
          OR iata_code ILIKE $1
          OR icao_code ILIKE $1
       ORDER BY
         CASE WHEN iata_code ILIKE $3 THEN 0
              WHEN icao_code ILIKE $3 THEN 1
              ELSE 2 END,
         rank DESC
       LIMIT $4`,
      [lk, q + ':*', t, n]
    ).then(r => r.rows).catch(() => []);
  }

  // ── Aircraft registry (520k rows, GIN indexed) ────────────────────────────
  if (type === 'all' || type === 'aircraft') {
    searches.aircraft = query(
      `SELECT
         icao24, registration, manufacturer, model,
         typecode, operator, operator_icao, operator_iata, owner, built,
         ts_rank(fts, to_tsquery('simple', $2)) AS rank
       FROM aircraft_registry
       WHERE fts @@ to_tsquery('simple', $2)
          OR registration ILIKE $1
          OR icao24 ILIKE $1
       ORDER BY
         CASE WHEN registration ILIKE $3 THEN 0
              WHEN icao24 ILIKE $3 THEN 1
              ELSE 2 END,
         rank DESC
       LIMIT $4`,
      [lk, q + ':*', t, n]
    ).then(r => r.rows).catch(() => []);
  }

  // ── Flight history (time-series, BTREE indexed on iata + airline) ──────────
  if (type === 'all' || type === 'flights') {
    searches.flights = query(
      `SELECT DISTINCT ON (flight_iata)
         flight_iata, flight_icao, airline, airline_iata,
         flight_status, flight_type,
         source_iata, dest_iata,
         aircraft_type, aircraft_source,
         estimated_pax, airport,
         MAX(time) OVER (PARTITION BY flight_iata) AS last_seen
       FROM flight_snapshots
       WHERE flight_iata ILIKE $1
          OR flight_icao ILIKE $1
          OR airline     ILIKE $1
          OR airline_iata ILIKE $1
          OR source_iata = upper($2)
          OR dest_iata   = upper($2)
       ORDER BY flight_iata, time DESC
       LIMIT $3`,
      [lk, t, n]
    ).then(r => r.rows).catch(() => []);
  }

  const [airports = [], aircraft = [], flights = []] = await Promise.all([
    searches.airports || Promise.resolve([]),
    searches.aircraft || Promise.resolve([]),
    searches.flights  || Promise.resolve([]),
  ]);

  return {
    airports,
    aircraft,
    flights,
    meta: {
      term: t,
      count: airports.length + aircraft.length + flights.length,
      airports_count: airports.length,
      aircraft_count: aircraft.length,
      flights_count:  flights.length,
    },
  };
}

module.exports = {
  query,
  initDB,
  pool,
  // Airport
  loadAllAirports,
  upsertAirport,
  // Flights
  insertFlightSnapshots,
  getFlightSnapshots,
  getStatusTrend,
  // Queue
  insertQueueSnapshot,
  getQueueHistory,
  // Search
  fullSearch,
  // Users
  createUser,
  findUserByUsername,
  findUserByEmail,
  findUserByUsernameOrEmail,
  findUserById,
  deleteUserById,
};
