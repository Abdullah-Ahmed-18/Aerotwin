-- ============================================================
-- Aerotwin — TimescaleDB Schema
-- ============================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── 0. Aircraft Registry (from aircraftDatabase.csv, ~520k rows) ───────────────
CREATE TABLE IF NOT EXISTS aircraft_registry (
  icao24          TEXT    PRIMARY KEY,
  registration    TEXT,
  manufacturer    TEXT,
  model           TEXT,
  typecode        TEXT,   -- e.g. B738, A320
  operator        TEXT,
  operator_icao   TEXT,
  operator_iata   TEXT,
  owner           TEXT,
  built           TEXT,
  status          TEXT
);

CREATE INDEX IF NOT EXISTS idx_aircraft_typecode
  ON aircraft_registry (typecode);

-- ── 0b. Airports Full (from airports.csv, ~80k rows) ──────────────────────────
CREATE TABLE IF NOT EXISTS airports_full (
  id              BIGINT  PRIMARY KEY,
  ident           TEXT,
  type            TEXT,   -- large_airport, medium_airport, small_airport, heliport, etc.
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
);

CREATE INDEX IF NOT EXISTS idx_airports_full_iata
  ON airports_full (iata_code)
  WHERE iata_code IS NOT NULL AND iata_code != '';

CREATE INDEX IF NOT EXISTS idx_airports_full_icao
  ON airports_full (icao_code)
  WHERE icao_code IS NOT NULL AND icao_code != '';

-- ── 1. Airports (static lookup — replaces airport_cache.json) ──────────────────
CREATE TABLE IF NOT EXISTS airports (
  iata_code   TEXT            PRIMARY KEY,
  name        TEXT,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  updated_at  TIMESTAMPTZ     DEFAULT NOW()
);

-- ── 2. Flight Snapshots (hypertable) ──────────────────────────────────────────
-- One row per flight per fetch cycle; partitioned by time for fast range queries.
CREATE TABLE IF NOT EXISTS flight_snapshots (
  time              TIMESTAMPTZ       NOT NULL,
  airport           TEXT              NOT NULL,  -- queried airport (e.g. HBE)
  flight_iata       TEXT,
  flight_icao       TEXT,
  airline           TEXT,
  airline_iata      TEXT,
  flight_status     TEXT,
  flight_type       TEXT,             -- Domestic | International
  source_iata       TEXT,
  dest_iata         TEXT,
  aircraft_type     TEXT,
  aircraft_source   TEXT,             -- CSV_DB | AviationStack | Dummy
  estimated_pax     INT,
  on_ground         BOOLEAN,
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  altitude_m        DOUBLE PRECISION,
  velocity_mps      DOUBLE PRECISION,
  heading           DOUBLE PRECISION
);

-- Convert to hypertable (partition by time, 1-day chunks)
SELECT create_hypertable(
  'flight_snapshots',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Useful indexes for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_fs_airport_time
  ON flight_snapshots (airport, time DESC);

CREATE INDEX IF NOT EXISTS idx_fs_flight_iata
  ON flight_snapshots (flight_iata, time DESC);

CREATE INDEX IF NOT EXISTS idx_fs_status_time
  ON flight_snapshots (flight_status, time DESC);

-- Auto-drop data older than 30 days
SELECT add_retention_policy(
  'flight_snapshots',
  INTERVAL '30 days',
  if_not_exists => TRUE
);

-- ── 3. Queue Wait Times (hypertable) ──────────────────────────────────────────
-- One row per checkpoint per estimation event; partitioned by time.
CREATE TABLE IF NOT EXISTS queue_wait_times (
  time              TIMESTAMPTZ   NOT NULL,
  airport           TEXT          NOT NULL,
  checkpoint_id     TEXT          NOT NULL,   -- e.g. 1ST-SEC
  checkpoint_label  TEXT,                     -- human-readable label
  checkpoint_type   TEXT,                     -- Security | Check-in | Passport | Boarding
  flow_type         TEXT,                     -- departure | arrival
  utilisation       DOUBLE PRECISION,         -- 0.0 – 1.0
  queue_length      INT,
  estimated_wait_s  INT,                      -- seconds
  arrival_rate      DOUBLE PRECISION,         -- pax/sec
  total_agents      INT,
  status            TEXT                      -- ok | warning | critical
);

SELECT create_hypertable(
  'queue_wait_times',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_qwt_airport_time
  ON queue_wait_times (airport, time DESC);

CREATE INDEX IF NOT EXISTS idx_qwt_checkpoint_time
  ON queue_wait_times (checkpoint_id, time DESC);

-- Auto-drop data older than 30 days
SELECT add_retention_policy(
  'queue_wait_times',
  INTERVAL '30 days',
  if_not_exists => TRUE
);
