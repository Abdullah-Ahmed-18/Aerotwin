# AeroTwin API Contract

> **Version:** 1.1.0  
> **Date:** 2026-06-02  
> **Services:** Node.js Express (`:5000`) + Python FastAPI (`:8000`)

---

## 1. Architecture Overview

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Next.js UI    │──────▶│  Node Express    │──────▶│  Python FastAPI │
│   (:3000)       │      │  (:5000)         │      │  (:8000)        │
└─────────────────┘      └──────────────────┘      └─────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   ┌─────────┐            ┌──────────┐           ┌──────────┐
   │PostgreSQL│            │AviationStack         │  Unity   │
   │TimescaleDB            │  API     │           │  DES     │
   └─────────┘            └──────────┘           └──────────┘
        ▼
   ┌─────────┐
   │ OpenSky │
   │ Network │
   └─────────┘
```

- **Express** handles auth, flight data, analytics, simulation runner, and proxies ML calls.
- **FastAPI** runs the PPO policy + DES engine locally for inference & insights.
- **Frontend** calls Express only; Express forwards ML requests to FastAPI.

### End-to-End Optimization Flow (v1.1.0)

```
User config + selected flights
        │
        ▼
   POST /api/optimize  ──▶  Derives ABS from flight personas
        │                     Runs PPO inference (baseline → inferred)
        │                     Runs DES on both configs
        │                     Saves comparison_*.json
        ▼
   Redirect to /insights  ──▶  Fetches latest comparison
                              Displays baseline vs. inferred metrics
```

**Key integration:** `POST /api/optimize` accepts the user's AERO config and flight schedule, derives passenger persona weights, runs the DRL model against the baseline config, simulates both configurations with the same ABS/seed, and persists a comparison file for the insights page.

---

## 2. Python PPO Service (FastAPI)

**Base URL:** `http://127.0.0.1:8000` (configurable via `PPO_SERVICE_URL`)

---

### 2.1 `GET /health`
Health-check for the PPO service.

| | |
|---|---|
| **Auth** | None |
| **Request** | — |
| **Response** | `{ "status": "ok", "model": "ppo_v1" }` |

---

### 2.2 `POST /infer`
Runs PPO inference and optionally simulates baseline vs. inferred configs.

| | |
|---|---|
| **Auth** | None |
| **Content-Type** | `application/json` **or** `multipart/form-data` |

**JSON Body:**
```json
{
  "abs_config": { /* ABS passenger persona weights */ },
  "aero_config?": { /* optional baseline AERO config */ },
  "seed?": 42,
  "pax_count?": 100
}
```

**Multipart Fields:**
- `abs_file` (required) — JSON upload
- `aero_file` (optional) — JSON upload
- `seed` (optional, default `42`)
- `pax_count` (optional, default `100`)

**Responses:**

*Without baseline:*
```json
{
  "aero_config": { /* inferred AERO checkpoint config */ },
  "action_norm": [0.12, 0.88, ...]
}
```

*With baseline:*
```json
{
  "aero_config": { /* inferred AERO checkpoint config */ },
  "action_norm": [0.12, 0.88, ...],
  "comparison": {
    "baseline": { "reward", "completion_rate", "mean_journey_min", "p95_journey_min", "per_checkpoint", "per_station" },
    "inferred": { /* same keys */ },
    "delta":    { /* same keys + per-station deltas */ }
  },
  "saved_to": "./comparisons/comparison_20260530_023832.json"
}
```

---

### 2.3 `POST /simulate`
Runs a single DES simulation for the given configuration.

| | |
|---|---|
| **Auth** | None |
| **Content-Type** | `application/json` |

**Body:**
```json
{
  "aero_config": { /* AERO checkpoint config */ },
  "abs_config":  { /* ABS persona weights */ },
  "seed?": 42,
  "pax_count?": 100
}
```

**Response:**
```json
{
  "reward": 8.36,
  "completion_rate": 1.0,
  "mean_journey_min": 12.5,
  "p95_journey_min": 20.3,
  "per_checkpoint": {
    "1ST-SEC": { "mqt": 2.5, "p95": 5.0, "throughput": 120.0 }
  },
  "per_station": {
    "1ST-SEC": {
      "SEC-01": { "mqt": 2.5, "p95": 5.0, "throughput": 120.0 }
    }
  }
}
```

---

### 2.4 `POST /insights`
Generates natural-language insights from a saved comparison file.

| | |
|---|---|
| **Auth** | None |
| **Content-Type** | `application/json` **or** `multipart/form-data` |

**JSON Body:**
```json
{ "comparison_file": "comparison_20260530_023832.json" }
```

**Multipart:** `comparison_file` (file upload)

**Response (Gemini):**
```json
{
  "summary": "Great news! The AI-optimized configuration improves...",
  "structured": {
    "baseline_reward": 8.36,
    "inferred_reward": 8.36,
    "reward_delta": 0.0,
    "completion_delta": 0.0,
    "mean_journey_delta_min": 0.0,
    "p95_journey_delta_min": 0.0,
    "top_improvements": [{ "checkpoint_id": "...", "p95_delta_min": -3.0, "baseline_p95": 10, "inferred_p95": 7 }],
    "top_regressions": [],
    "station_improvements": [{ "checkpoint_id": "...", "station_id": "...", "p95_delta_min": -3.0, "baseline_p95": 10, "inferred_p95": 7 }],
    "station_regressions": [],
    "iata_compliance": { "optimum": 1, "sub_optimum": 0, "over_design": 0, "unknown": 0 },
    "total_checkpoints": 1,
    "operational_changes": [{ "checkpoint": "1ST-SEC", "action": "Add parallel lane..." }],
    "total_checkpoint_p95_delta": -5.2,
    "total_station_p95_delta": -4.8,
    "total_improvements_p95": -8.5,
    "total_regressions_p95": 3.3,
    "improvement_count": 4,
    "regression_count": 2
  },
  "model_used": "gemini-1.5-flash-latest",
  "comparison_file": "./comparisons/comparison_20260530_023832.json"
}
```

**New `structured` fields (v1.1.0):**

| Field | Type | Description |
|---|---|---|
| `total_checkpoint_p95_delta` | `number` | Net sum of **all** checkpoint P95 deltas (negative = time saved overall) |
| `total_station_p95_delta` | `number` | Net sum of **all** station P95 deltas |
| `total_improvements_p95` | `number` | Sum of improvement deltas only (negative value) |
| `total_regressions_p95` | `number` | Sum of regression deltas only (positive value) |
| `improvement_count` | `number` | Total checkpoints that improved (threshold \|ΔP95\| > 0.5 min) |
| `regression_count` | `number` | Total checkpoints that regressed (threshold \|ΔP95\| > 0.5 min) |

> **Note:** `top_improvements` and `top_regressions` are capped at 3 items each. The `total_*` fields above aggregate **all** checkpoints so the UI can show the true net impact.

**Response (Fallback — no Gemini key):**
Same shape, but `model_used` = `"rule_based_fallback"` and `summary` is rule-generated text.

---

## 3. Node.js Backend (Express)

**Base URL:** `http://localhost:5000`

### Global Middleware
| Middleware | Scope | Description |
|---|---|---|
| `cors()` | `*` | Cross-origin requests enabled |
| `express.json()` | `*` | JSON body parsing |
| `swagger-ui-express` | `/api-docs` | OpenAPI documentation (YAML) |

---

### 3.1 Flights

#### `GET /api/fetch-active-flights`
Fetches live flight data, enriches with OpenSky, resolves aircraft types, persists to DB.

| | |
|---|---|
| **Query** | `?airport=<IATA/ICAO>` (default `HBE`), `?status=<active\|all\|...>` |
| **Response** | `{ meta: {...}, flights: [...] }` |

**`meta` fields:**
- `updated`, `airport`, `airport_icao`, `count`, `arrivals_fetched`, `departures_fetched`
- `status_counts` (e.g. `{ active: 5, scheduled: 12 }`)
- `opensky_enriched`, `opensky_aircraft_nearby`, `peak_hour`, `on_time_rate`

**`flight` fields:**
- `flight_id`, `flight_date`, `flight_status`, `airline`, `departure`/`arrival` (airport, scheduled, estimated, actual, delay, gate, terminal)
- `aircraft` (type, registration, capacity, model_path)
- `live` (latitude, longitude, altitude, speed, heading)
- `payload_stats` (total_passengers, total_baggage_kg)

---

#### `POST /api/save-active-flights`
Manually persists a flight snapshot.

| | |
|---|---|
| **Body** | `{ airport?, meta?, flights: [...] }` |
| **Response** | `{ success: true, path: "active_flights.json", count: 14 }` |

---

### 3.2 Airports

#### `POST /api/airports-batch`
Bulk airport coordinate resolution (cached).

| | |
|---|---|
| **Body** | `{ codes: ["HBE", "CAI", "DXB"] }` |
| **Response** | `{ count: 3, airports: { "HBE": { code, name, coords } }, credits_saved: 2, credits_used: 1 }` |

---

#### `GET /api/airport-location`
Single airport lookup.

| | |
|---|---|
| **Query** | `?airport=HBE` |
| **Response** | `{ code: "HBE", name: "Borg El Arab Airport", coords: [30.9177, 29.6964] }` |

---

### 3.3 OpenSky Network

#### `GET /api/opensky/live`
Live aircraft state vectors near the airport.

| | |
|---|---|
| **Query** | `?airport=<IATA>` (default `HBE`) |
| **Response** | `{ meta: { updated, airport, aircraft_count, bounding_box }, aircraft: [...] }` |

---

#### `GET /api/opensky/arrivals`
Historical arrivals.

| | |
|---|---|
| **Query** | `?airport=<IATA>&hours=<1-168>` (default `48`) |
| **Response** | `{ meta: { updated, airport, hours_queried, arrival_count }, arrivals: [...] }` |

---

### 3.4 Search

#### `GET /api/search`
Full-text search across airports, aircraft registry, and flight snapshots.

| | |
|---|---|
| **Query** | `?q=<term>&type=<all\|airports\|aircraft\|flights>&limit=<1-100>` |
| **Response** | `{ airports: [], aircraft: [], flights: [], meta: { term, count, ... } }` |

---

### 3.5 Analytics (TimescaleDB)

#### `GET /api/analytics/flights`
Raw flight snapshot history.

| | |
|---|---|
| **Query** | `?airport=<IATA>&hours=<1-720>` (default `24`) |
| **Response** | `{ meta: { airport, hours_back, count, updated }, snapshots: [...] }` |

---

#### `GET /api/analytics/status-trend`
Hourly status aggregation.

| | |
|---|---|
| **Query** | `?airport=<IATA>&hours=<1-168>` (default `6`) |
| **Response** | `{ meta: { airport, hours_back, updated }, trend: [...] }` |

---

#### `GET /api/analytics/queue`
5-minute bucket queue wait history.

| | |
|---|---|
| **Query** | `?airport=<IATA>&hours=<0.08-168>` (default `1`) |
| **Response** | `{ meta: { airport, hours_back, updated }, queue_history: [...] }` |

---

#### `POST /api/analytics/queue`
Persist a queue snapshot from the frontend estimator.

| | |
|---|---|
| **Body** | `{ airport?: "HBE", results: [ { checkpoint_id, checkpoint_label, checkpoint_type, flow_type, utilisation, queue_length, wait_secs, arrival_rate, total_agents, status }, ... ] }` |
| **Response** | `{ success: true, airport, count: 6 }` (201) |

---

### 3.6 Authentication

#### `POST /api/signup`

| | |
|---|---|
| **Body** | `{ username, full_name, email, password }` |
| **Response** | `{ success: true, user: { id, username, full_name, email, created_at, updated_at } }` (201) |
| **Errors** | `400` validation, `409` duplicate username/email |

---

#### `POST /api/signin`

| | |
|---|---|
| **Body** | `{ identifier, password }` (identifier = username or email) |
| **Response** | `{ success: true, token, user: { id, username, full_name, email, created_at, updated_at } }` |
| **Errors** | `400` missing fields, `401` invalid credentials |

---

#### `POST /api/signout`

| | |
|---|---|
| **Headers** | `Authorization: Bearer <token>` |
| **Response** | `{ success: true, message: "Signed out successfully." }` |

---

#### `DELETE /api/user`

| | |
|---|---|
| **Headers** | `Authorization: Bearer <token>` |
| **Response** | `{ success: true, user: { ... } }` |

---

### 3.7 Simulation Runner (Unity)

#### `POST /api/runs`
Queue a new Unity simulation run.

| | |
|---|---|
| **Body** | `{ desconfig: object, absconfigs?: object|array, flights: array }` |
| **Response** | `{ runId: "RUN_...", status: "running" }` (202) |
| **Errors** | `400` missing config/flights, `503` Unity executable not found |

**Process:**
1. Creates `Backend/runs/<runId>/`
2. Writes `AerotwinConfig.json`, `active_flights.json`, `absconfig.json`
3. Spawns Unity executable in batch mode (`-batchmode -simSpeed 50`)
4. Monitors process in-memory

---

#### `GET /api/runs/:id/status`
Poll run status.

| | |
|---|---|
| **Response** | `{ runId, status: "running"|"completed"|"failed", startTime, elapsedMs, error? }` |

---

#### `GET /api/runs/:id/results`
Aggregated KPIs from completed run.

| | |
|---|---|
| **Response** | `{ runId, status: "completed", summary: { totalPassengers, completedPassengers, meanJourneyTime, p90JourneyTime, weightedKpiScore }, checkpoints: [...], flights: [...] }` |

---

#### `GET /api/runs/:id/events`
Raw CSV rows.

| | |
|---|---|
| **Query** | `?flight=<FLIGHT_ID>` (optional filter) |
| **Response** | `{ runId, flight, count, rows: [...] }` |

---

#### `GET /api/runs/:id/replay`
Time-sorted event stream for the replay viewer.

| | |
|---|---|
| **Response** | `{ runId, durationSec, layoutConstants: { zSpacing, xStationGap, xCheckpointPadding, flowSpacing }, checkpoints: [{ id, type, flowType, depth, prevAnchor, nextAnchors, stationCount, stations }], events: [{ t, type, passengerId, checkpointId, stationId, flightId, passengerClass, status? }] }` |

---

### 3.8 Digital Twin Formatting

#### `POST /api/format-aerotwin-data`
Transforms frontend checkpoint config into backend AERO format.

| | |
|---|---|
| **Body** | Array of checkpoint objects with `id`, `idCode`, `flowType`, `nextCheckpointIds`, `Stations`, etc. |
| **Response** | `{ success: true, data: { Departure: { Checkpoints: [...] }, Arrival: { Checkpoints: [...] } }, checkpointsProcessed: 6 }` |

**Mapping:** Uses `Backend/KeyMapping.json` to map frontend keys → backend keys and injects task templates from `Backend/AerotwinConfig.json`.

---

### 3.9 PPO / Digital Twin Inference Proxy

All routes below forward to the Python FastAPI service (`PPO_SERVICE_URL`, default `http://127.0.0.1:8000`).

| Method | Path | Proxies To | Upload |
|---|---|---|---|
| `POST` | `/api/optimize` | `POST /infer` | End-to-end: flights → ABS → inference + DES comparison |
| `POST` | `/api/infer` | `POST /infer` | `upload.fields([{name:'abs_file'}, {name:'aero_file'}])` |
| `POST` | `/api/simulate` | `POST /simulate` | — |
| `POST` | `/api/insights` | `POST /insights` | `upload.single('comparison_file')` |
| `GET`  | `/api/infer/health` | `GET /health` | — |
| `GET`  | `/api/comparisons/latest` | — (local filesystem) | — |

#### `POST /api/optimize`
End-to-end optimization flow. Derives an ABS config from the provided flights' personas (weighted by passenger count), runs PPO inference against the user's AERO config as baseline, then runs DES on both baseline and inferred configs.

| | |
|---|---|
| **Request** | `{ aero_config: object, flights: FlightPayload[], seed?: number, pax_count?: number }` |
| **Response** | `{ success: true, comparison: {...}, savedTo: string, inferredAero: object, actionNorm: number[], absConfig: { weights: number[] } }` |
| **Errors** | `400` missing aero_config or flights; `500` PPO service unavailable or DES failure |

**Example:**
```json
// POST /api/optimize
{
  "aero_config": { "Departure": { "Checkpoints": [...] } },
  "flights": [
    {
      "flight_id": "MS-441",
      "personas": { "p1": 0, "p2": 0, "p3": 0, "p4": 70, "p5": 0, "p6": 20, "p7": 10 },
      "payload_stats": { "total_passengers": "150 (Simulated)" }
    }
  ],
  "seed": 42,
  "pax_count": 100
}
```

#### `GET /api/comparisons/latest`
Returns the most recent comparison filename.

| | |
|---|---|
| **Response** | `{ filename: "comparison_20260530_023832.json" }` (200) |
| **Errors** | `404` no comparisons found |

---

## 4. Data Models

### 4.1 Checkpoint (AERO Config)
```typescript
interface Checkpoint {
  Checkpoint_ID: string;        // e.g. "1ST-SEC"
  Checkpoint_Type: string;      // e.g. "Security"
  Flow_Type: "departure" | "arrival";
  Prev_Anchor: string;
  Next_Anchor: string[];
  Stations: Station[];
}

interface Station {
  Station_ID: string;
  Staffing_No: number;
  Avg_Service_Time: number;     // seconds
  Max_Queue_Cap: number;
  Efficiency_Factor: number;
  Allowed_Class: string[];
  Tasks: Task[];
}

interface Task {
  Task_Name: string;
  Avg_Duration: number;         // seconds
  Probability: number;          // 0.0 – 1.0
}
```

### 4.2 ABS Config
```typescript
interface ABSConfig {
  weights: number[];  // 7 persona spawn weights (must sum to 1.0)
}
```

### 4.3 DES Stats
```typescript
interface DESStats {
  per_checkpoint: Record<string, {
    mqt: number;        // mean queue time (minutes)
    p95: number;        // 95th percentile queue time (minutes)
    throughput: number; // pax/hour
  }>;
  per_station: Record<string, Record<string, {
    mqt: number;
    p95: number;
    throughput: number;
  }>>;
  mean_journey_min: number;
  p95_journey_min: number;
  completion_rate: number;
  reward: number;
}
```

### 4.4 Comparison File
```typescript
interface ComparisonFile {
  timestamp: string;
  seed: number;
  pax_count: number;
  abs_config: ABSConfig;
  baseline_aero: { Departure?: { Checkpoints: Checkpoint[] }, Arrival?: { Checkpoints: Checkpoint[] } };
  inferred_aero:  { Departure?: { Checkpoints: Checkpoint[] }, Arrival?: { Checkpoints: Checkpoint[] } };
  comparison: {
    baseline: DESStats & { per_checkpoint: {...}, per_station: {...} };
    inferred:  DESStats & { per_checkpoint: {...}, per_station: {...} };
    delta:     DESStats & { per_checkpoint: {...}, per_station: {...} };
  };
}
```

---

## 5. Auth & Security

| Concern | Implementation |
|---|---|
| **Password hashing** | `bcrypt` (salt rounds: 12) |
| **JWT** | `jsonwebtoken`, HS256, 24h expiry |
| **Token blacklist** | In-memory `Set()` (resets on server restart) |
| **Protected routes** | `POST /api/signout`, `DELETE /api/user` require `Authorization: Bearer <token>` |
| **CORS** | Enabled globally (`app.use(cors())`) |

---

## 6. Error Handling

### Node.js (Express)
All routes follow a consistent pattern:
- `400` — bad request / validation error
- `401` — unauthorized / invalid credentials
- `404` — resource not found
- `409` — conflict (duplicate username/email)
- `500` — internal server error
- `503` — service unavailable (Unity not found, PPO down)

**Error shape:**
```json
{ "error": "Human-readable description" }
```

### Python (FastAPI)
- `400` — malformed request / missing files
- `404` — comparison file not found
- `500` — simulation failure / insight generation failure
- `503` — PPO service unavailable (proxied from Node)

**Error shape:**
```json
{ "detail": "Human-readable description" }
```

---

## 7. Environment Variables

| Variable | Service | Default | Purpose |
|---|---|---|---|
| `PORT` | Node | `5000` | Express listen port |
| `PPO_SERVICE_URL` | Node | `http://127.0.0.1:8000` | FastAPI proxy target |
| `AVIATIONSTACK_API_KEY` | Node | — | AviationStack API |
| `OPENSKY_CLIENT_ID` | Node | — | OpenSky OAuth2 |
| `OPENSKY_CLIENT_SECRET` | Node | — | OpenSky OAuth2 |
| `JWT_SECRET` | Node | `aerotwin-jwt-fallback-secret` | JWT signing |
| `TARGET_AIRPORT` | Node | `HBE` | Default airport code |
| `GEMINI_API_KEY` | Python | — | Gemini LLM for insights |
| `UNITY_EXE_PATH` | Node | — | Path to Unity executable |

---

## 8. Scripts

```bash
# Node backend
cd Backend
npm run start        # node backend.js
npm run start:node   # node backend.js
npm run start:ppo    # cd PPO && uvicorn main:app --port 8000
npm run dev          # concurrently both services

# Python PPO service
cd Backend/PPO
uvicorn main:app --port 8000

# Frontend
cd frontend
npm run dev          # next dev (localhost:3000)
```
