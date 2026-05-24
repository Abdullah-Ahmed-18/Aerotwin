/**
 * db/bootstrap.js
 * ---------------
 * One-shot script to create the `aerotwin` database and apply the schema.
 * Run once: node db/bootstrap.js
 *
 * Connects to `postgres` (default DB) first to CREATE DATABASE,
 * then reconnects to `aerotwin` to run schema.sql.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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

const params  = parseDbUrl(process.env.DATABASE_URL);
const dbName  = params.database;

async function run() {
  // ── Step 1: connect to `postgres` to create the DB if it doesn't exist ──────
  // Try with the password first; if that fails, try without (Windows trust auth)
  async function connectAdmin() {
    const c = new Client({ ...params, database: 'postgres' });
    await c.connect();
    return c;
  }

  const adminClient = await connectAdmin();

  try {
    console.log('✅ Connected to postgres (admin)');

    const existing = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
    );
    if (existing.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database "${dbName}" created`);
    } else {
      console.log(`ℹ️  Database "${dbName}" already exists — skipping create`);
    }
  } finally {
    await adminClient.end();
  }

  // ── Step 2: connect to aerotwin and run schema.sql ───────────────────────────
  async function connectApp() {
    const c = new Client({ ...params, database: dbName });
    await c.connect();
    return c;
  }
  const appClient = await connectApp();

  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  try {
    console.log(`✅ Connected to "${dbName}"`);

    // Split on semicolons and run statements individually to handle multi-statement SQL
    const statements = schemaSql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      try {
        await appClient.query(stmt);
      } catch (err) {
        // Non-fatal: hypertable already exists, index already exists, etc.
        if (err.message.includes('already exists') || err.message.includes('if_not_exists')) {
          console.log(`  ⚠️  Skipped (already exists): ${stmt.substring(0, 60)}...`);
        } else {
          throw err;
        }
      }
    }

    console.log('✅ Schema applied successfully');
    console.log('\n🚀 Aerotwin TimescaleDB is ready!');
    console.log(`   Tables: airports, flight_snapshots, queue_wait_times`);
    console.log(`   Hypertables: flight_snapshots, queue_wait_times (30-day retention)`);
  } finally {
    await appClient.end();
  }
}

run().catch(err => {
  console.error('❌ Bootstrap failed:', err.message);
  console.error('\n💡 Tip: Make sure PostgreSQL is running and update DATABASE_URL in .env');
  console.error('   Current DATABASE_URL:', process.env.DATABASE_URL);
  process.exit(1);
});
