require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require('./db');
const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// CONFIGURATION
// ==========================================
const API_KEY = process.env.AVIATIONSTACK_API_KEY;
const TARGET_AIRPORT = process.env.TARGET_AIRPORT || "HBE";
const API_URL = "https://api.aviationstack.com/v1/flights";
const AIRPORTS_URL = "https://api.aviationstack.com/v1/airports";
const DOMESTIC_EGYPT_AIRPORTS = ["CAI", "SSH", "HRG", "LXR", "ASW", "HBE", "ALY", "TCP", "RMF"];
const AIRCRAFT_CAPACITIES = { "B738": 189, "A320": 180, "A220": 135, "B38M": 189, "A321": 220, "A333": 300, "A21N": 240, "AT72": 72 };
const JWT_SECRET = process.env.JWT_SECRET || 'aerotwin-jwt-fallback-secret';
const JWT_EXPIRES_IN = '24h';
const BCRYPT_SALT_ROUNDS = 12;
const AIRPORT_COORDINATES = {
    // Egypt
    HBE: { code: "HBE", name: "Borg El Arab Airport", coords: [30.9177, 29.6964] },
    CAI: { code: "CAI", name: "Cairo International Airport", coords: [30.1219, 31.4056] },
    SSH: { code: "SSH", name: "Sharm El Sheikh International Airport", coords: [27.9773, 34.3950] },
    HRG: { code: "HRG", name: "Hurghada International Airport", coords: [27.1783, 33.7994] },
    LXR: { code: "LXR", name: "Luxor International Airport", coords: [25.6710, 32.7066] },
    ASW: { code: "ASW", name: "Aswan International Airport", coords: [23.9644, 32.8200] },
    // Gulf
    DXB: { code: "DXB", name: "Dubai International Airport", coords: [25.2532, 55.3657] },
    AUH: { code: "AUH", name: "Abu Dhabi International Airport", coords: [24.433, 54.6511] },
    DOH: { code: "DOH", name: "Hamad International Airport", coords: [25.2731, 51.6086] },
    JED: { code: "JED", name: "King Abdulaziz International Airport", coords: [21.6796, 39.1565] },
    MED: { code: "MED", name: "Prince Mohammad Bin Abdulaziz Airport", coords: [24.5534, 39.7051] },
    RUH: { code: "RUH", name: "King Khalid International Airport", coords: [24.9576, 46.6988] },
    KWI: { code: "KWI", name: "Kuwait International Airport", coords: [29.2266, 47.9689] },
    // Middle East
    AMM: { code: "AMM", name: "Queen Alia International Airport", coords: [31.7226, 35.9932] },
    BEY: { code: "BEY", name: "Beirut–Rafic Hariri International Airport", coords: [33.8209, 35.4884] },
    IST: { code: "IST", name: "Istanbul Airport", coords: [41.2753, 28.7519] },
    // Europe
    LHR: { code: "LHR", name: "London Heathrow Airport", coords: [51.47, -0.4543] },
    CDG: { code: "CDG", name: "Charles de Gaulle Airport", coords: [49.0097, 2.5479] },
    FRA: { code: "FRA", name: "Frankfurt Airport", coords: [50.0379, 8.5622] },
    ATH: { code: "ATH", name: "Athens International Airport", coords: [37.9364, 23.9445] },
    // Americas
    JFK: { code: "JFK", name: "John F. Kennedy International Airport", coords: [40.6413, -73.7781] },
    // North Africa
    TUN: { code: "TUN", name: "Tunis–Carthage International Airport", coords: [36.8510, 10.2272] },
};
// --- Persistent Airport Cache (disk-backed + DB-backed) ---
const AIRPORT_CACHE_PATH = path.join(__dirname, 'airport_cache.json');
const airportLookupCache = new Map(Object.entries(AIRPORT_COORDINATES).map(([code, data]) => [code, data]));

function loadAirportCacheFromDisk() {
    try {
        if (fs.existsSync(AIRPORT_CACHE_PATH)) {
            const raw = JSON.parse(fs.readFileSync(AIRPORT_CACHE_PATH, 'utf8'));
            let loaded = 0;
            for (const [code, data] of Object.entries(raw)) {
                if (!airportLookupCache.has(code)) {
                    airportLookupCache.set(code, data);
                    loaded++;
                }
            }
            console.log(`✅ Airport cache loaded from disk: ${loaded} new entries (${airportLookupCache.size} total)`);
        }
    } catch (err) {
        console.warn('⚠️  Could not load airport cache from disk:', err.message);
    }
}

async function loadAirportCacheFromDB() {
    try {
        const dbAirports = await db.loadAllAirports();
        let loaded = 0;
        for (const [code, data] of Object.entries(dbAirports)) {
            if (!airportLookupCache.has(code)) {
                airportLookupCache.set(code, data);
                loaded++;
            }
        }
        if (loaded > 0) {
            console.log(`✅ [DB] Airport cache enriched: ${loaded} new entries from DB (${airportLookupCache.size} total)`);
        }
    } catch (err) {
        console.warn('⚠️  [DB] Could not enrich airport cache from DB:', err.message);
    }
}

function saveAirportCacheToDisk() {
    try {
        const cacheObj = Object.fromEntries(airportLookupCache);
        fs.writeFileSync(AIRPORT_CACHE_PATH, JSON.stringify(cacheObj, null, 2));
    } catch (err) {
        console.warn('⚠️  Could not save airport cache to disk:', err.message);
    }
}

// Load persisted airport cache on startup (disk — DB loaded after initDB)
loadAirportCacheFromDisk();

async function resolveAirportLocation(airportCodeRaw) {
    const airportCode = String(airportCodeRaw || '').trim().toUpperCase();
    if (!airportCode) return null;

    const cached = airportLookupCache.get(airportCode);
    if (cached) {
        console.log(`✅ Airport ${airportCode}: cache hit (no API credit used)`);
        return cached;
    }

    try {
        console.log(`🌐 Airport ${airportCode}: NOT in cache — calling AviationStack API (1 credit)`);
        const response = await axios.get(AIRPORTS_URL, {
            params: {
                access_key: API_KEY,
                iata_code: airportCode,
                limit: 1
            }
        });

        const airport = response.data?.data?.[0];
        const latitude = Number(airport?.latitude);
        const longitude = Number(airport?.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            console.warn(`⚠️  Airport ${airportCode}: API returned no valid coordinates`);
            return null;
        }

        const resolved = {
            code: airportCode,
            name: airport?.airport_name || airport?.airport || airportCode,
            coords: [latitude, longitude]
        };

        airportLookupCache.set(airportCode, resolved);
        saveAirportCacheToDisk(); // persist to JSON (fallback)
        db.upsertAirport(airportCode, resolved).catch(() => {}); // persist to DB
        console.log(`💾 Airport ${airportCode}: cached and saved to disk + DB`);
        return resolved;
    } catch (error) {
        console.error(`❌ Airport lookup error for ${airportCode}:`, error.message);
        return null;
    }
}

// ==========================================
// OPENSKY NETWORK API (OAuth2 Client Credentials)
// ==========================================
const OPENSKY_TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const OPENSKY_API_BASE = "https://opensky-network.org/api";
const OPENSKY_CLIENT_ID = process.env.OPENSKY_CLIENT_ID;
const OPENSKY_CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET;
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

// IATA → ICAO airport mapping (OpenSky uses ICAO codes)
const IATA_TO_ICAO = {
    HBE: "HEBA", CAI: "HECA", SSH: "HESH", HRG: "HEGN",
    LXR: "HELX", ASW: "HESN", ALY: "HEAX", TCP: "HETB", RMF: "HERM",
    DXB: "OMDB", AUH: "OMAA", MED: "OEMA", JED: "OEJN", RUH: "OERK",
    DOH: "OTHH", KWI: "OKBK", BAH: "OBBI", MCT: "OOMS", AMM: "OJAI",
    BEY: "OLBA",
    LHR: "EGLL", CDG: "LFPG", FRA: "EDDF", AMS: "EHAM", FCO: "LIRF",
    IST: "LTFM", ATH: "LGAV", BCN: "LEBL", MUC: "EDDM", ZRH: "LSZH",
    JFK: "KJFK", LAX: "KLAX", ORD: "KORD", ATL: "KATL", DFW: "KDFW",
    YYZ: "CYYZ",
    ADD: "HAAB", NBO: "HKJK", JNB: "FAOR", CMN: "GMMN", TUN: "DTTA",
    ALG: "DAAG", KRT: "HSSS",
};

// Airline IATA → ICAO callsign prefix (OpenSky uses ICAO prefixes)
const AIRLINE_IATA_TO_ICAO = {
    MS: "MSR", FZ: "FDB", G9: "ABY", SV: "SVA", TK: "THY",
    W6: "WZZ", J9: "JZR", QR: "QTR", EK: "UAE", EY: "ETD",
    LH: "DLH", BA: "BAW", AF: "AFR", KL: "KLM", LX: "SWR",
    AA: "AAL", UA: "UAL", DL: "DAL", RJ: "RJA", ME: "MEA",
    NE: "NES", XY: "KNE",
};

function iataToIcao(iataCode) {
    const icao = IATA_TO_ICAO[iataCode?.toUpperCase()];
    if (!icao) console.warn(`⚠️  OpenSky: No ICAO mapping for IATA "${iataCode}"`);
    return icao || null;
}

// --- OAuth2 Token Manager ---
class OpenSkyTokenManager {
    constructor() {
        this.accessToken = null;
        this.expiresAt = 0;
        this.refreshPromise = null;
    }
    async getToken() {
        if (this.accessToken && Date.now() < this.expiresAt) return this.accessToken;
        if (this.refreshPromise) return this.refreshPromise;
        this.refreshPromise = this._refresh();
        try { return await this.refreshPromise; }
        finally { this.refreshPromise = null; }
    }
    async getHeaders() {
        const token = await this.getToken();
        return { Authorization: `Bearer ${token}` };
    }
    async _refresh() {
        try {
            console.log("🔑 OpenSky: Requesting new access token...");
            const res = await axios.post(OPENSKY_TOKEN_URL,
                new URLSearchParams({
                    grant_type: "client_credentials",
                    client_id: OPENSKY_CLIENT_ID,
                    client_secret: OPENSKY_CLIENT_SECRET,
                }).toString(),
                { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
            );
            this.accessToken = res.data.access_token;
            this.expiresAt = Date.now() + (res.data.expires_in * 1000) - TOKEN_REFRESH_MARGIN_MS;
            console.log(`✅ OpenSky: Token acquired (expires in ${res.data.expires_in}s)`);
            return this.accessToken;
        } catch (err) {
            console.error("❌ OpenSky: Token fetch failed:", err.response?.data || err.message);
            throw new Error("OpenSky token acquisition failed");
        }
    }
    _clearToken() { this.accessToken = null; this.expiresAt = 0; }
}
const openskyTokens = new OpenSkyTokenManager();

// --- OpenSky: Fetch live aircraft near airport (±0.5° bounding box) ---
async function fetchOpenSkyLiveNearAirport(iataCode, airportCoords) {
    try {
        const headers = await openskyTokens.getHeaders();
        const [lat, lon] = airportCoords.coords;
        console.log(`🛫 OpenSky: Fetching live aircraft near ${iataCode} [${lat}, ${lon}]...`);
        const response = await axios.get(`${OPENSKY_API_BASE}/states/all`, {
            headers,
            params: { lamin: lat-0.5, lamax: lat+0.5, lomin: lon-0.5, lomax: lon+0.5, extended: 1 },
            timeout: 15000,
        });
        const states = response.data?.states || [];
        console.log(`📡 OpenSky: ${states.length} aircraft near ${iataCode}`);
        return states.map(s => ({
            icao24: s[0], callsign: s[1]?.trim() || null, origin_country: s[2],
            longitude: s[5], latitude: s[6], baro_altitude: s[7], on_ground: s[8],
            velocity: s[9], true_track: s[10], vertical_rate: s[11],
            geo_altitude: s[13], squawk: s[14], category: s[17],
        }));
    } catch (err) {
        if (err.response?.status === 401) openskyTokens._clearToken();
        console.error("❌ OpenSky live fetch failed:", err.response?.status, err.message);
        return [];
    }
}

// --- OpenSky: Fetch historical arrivals (batch-processed nightly) ---
async function fetchOpenSkyArrivals(iataCode, hoursBack = 48) {
    try {
        const headers = await openskyTokens.getHeaders();
        const icaoCode = iataToIcao(iataCode);
        if (!icaoCode) return [];
        const now = Math.floor(Date.now() / 1000);
        console.log(`🛬 OpenSky: Fetching arrivals at ${iataCode} (${icaoCode}) past ${hoursBack}h...`);
        const response = await axios.get(`${OPENSKY_API_BASE}/flights/arrival`, {
            headers, params: { airport: icaoCode, begin: now - (hoursBack * 3600), end: now }, timeout: 15000,
        });
        const flights = response.data || [];
        console.log(`📋 OpenSky: ${flights.length} arrivals at ${icaoCode}`);
        return flights.map(f => ({
            icao24: f.icao24, callsign: f.callsign?.trim() || null,
            departure_airport_icao: f.estDepartureAirport, arrival_airport_icao: f.estArrivalAirport,
            first_seen: f.firstSeen, last_seen: f.lastSeen,
            first_seen_iso: f.firstSeen ? new Date(f.firstSeen * 1000).toISOString() : null,
            last_seen_iso: f.lastSeen ? new Date(f.lastSeen * 1000).toISOString() : null,
        }));
    } catch (err) {
        if (err.response?.status === 404) { console.log(`ℹ️  OpenSky: No arrivals at ${iataCode}`); return []; }
        if (err.response?.status === 401) openskyTokens._clearToken();
        console.error("❌ OpenSky arrivals failed:", err.response?.status, err.message);
        return [];
    }
}

// --- OpenSky: Fetch recent flights to build callsign→icao24 map ---
// This covers flights in the last 2 hours, even if they're not currently live
async function fetchOpenSkyRecentFlights() {
    try {
        const headers = await openskyTokens.getHeaders();
        const now = Math.floor(Date.now() / 1000);
        const begin = now - 7200; // 2 hours back (API max)
        console.log(`🔍 OpenSky: Fetching all recent flights (past 2h) for callsign→icao24 mapping...`);
        const response = await axios.get(`${OPENSKY_API_BASE}/flights/all`, {
            headers, params: { begin, end: now }, timeout: 15000,
        });
        const flights = response.data || [];
        console.log(`📋 OpenSky flights/all: ${flights.length} flights in past 2h`);
        return flights;
    } catch (err) {
        if (err.response?.status === 404) { console.log(`ℹ️  OpenSky: No recent flights returned`); return []; }
        if (err.response?.status === 401) openskyTokens._clearToken();
        console.error("❌ OpenSky flights/all failed:", err.response?.status, err.message);
        return [];
    }
}

// --- Build a comprehensive callsign → icao24 map from multiple OpenSky sources ---
function buildCallsignToHexMap(openskyLiveStates, openskyArrivals, openskyRecentFlights) {
    const map = new Map(); // callsign → icao24

    // Source 1: Live state vectors (highest priority — plane is in the air right now)
    for (const s of openskyLiveStates) {
        if (s.callsign && s.icao24) {
            map.set(s.callsign, s.icao24);
            const cleaned = s.callsign.replace(/\s+/g, '');
            if (cleaned !== s.callsign) map.set(cleaned, s.icao24);
        }
    }

    // Source 2: Recent flights from /flights/all
    for (const f of openskyRecentFlights) {
        const cs = f.callsign?.trim();
        if (cs && f.icao24 && !map.has(cs)) {
            map.set(cs, f.icao24);
        }
    }

    // Source 3: Historical arrivals
    for (const a of openskyArrivals) {
        if (a.callsign && a.icao24 && !map.has(a.callsign)) {
            map.set(a.callsign, a.icao24);
        }
    }

    return map;
}

// --- OpenSky: Callsign lookup + flight matching (for live position data) ---
function buildCallsignLookup(openskyStates) {
    const lookup = new Map();
    for (const s of openskyStates) {
        if (s.callsign) {
            lookup.set(s.callsign, s);
            const cleaned = s.callsign.replace(/\s+/g, '');
            if (cleaned !== s.callsign) lookup.set(cleaned, s);
        }
    }
    return lookup;
}

function matchFlightToOpenSky(flightIata, callsignLookup) {
    if (!flightIata || callsignLookup.size === 0) return null;
    const direct = callsignLookup.get(flightIata);
    if (direct) return direct;
    const airlineIata = flightIata.substring(0, 2).toUpperCase();
    const flightNum = flightIata.substring(2);
    const icaoPrefix = AIRLINE_IATA_TO_ICAO[airlineIata];
    if (icaoPrefix) {
        const match = callsignLookup.get(`${icaoPrefix}${flightNum}`);
        if (match) return match;
    }
    return null;
}

// --- Resolve icao24 for a flight using the callsign→hex map ---
function resolveIcao24(flightIata, callsignToHexMap) {
    if (!flightIata || callsignToHexMap.size === 0) return null;
    // Direct match (IATA code as callsign)
    const direct = callsignToHexMap.get(flightIata);
    if (direct) return direct;
    // Try ICAO callsign version
    const airlineIata = flightIata.substring(0, 2).toUpperCase();
    const flightNum = flightIata.substring(2);
    const icaoPrefix = AIRLINE_IATA_TO_ICAO[airlineIata];
    if (icaoPrefix) {
        const icaoCallsign = `${icaoPrefix}${flightNum}`;
        const match = callsignToHexMap.get(icaoCallsign);
        if (match) return match;
    }
    return null;
}

// ==========================================
// LOCAL CSV - Aircraft Identity by ICAO24 Hex
// ==========================================
const AIRCRAFT_CSV_PATH = path.join(__dirname, 'aircraftDatabase.csv');
const aircraftDatabase = new Map(); // icao24 → aircraft info

function loadAircraftCSV() {
    return new Promise((resolve, reject) => {
        let count = 0;
        fs.createReadStream(AIRCRAFT_CSV_PATH)
            .pipe(csv())
            .on('data', (row) => {
                const hex = (row.icao24 || '').toLowerCase().trim();
                if (hex) {
                    aircraftDatabase.set(hex, {
                        icao_type: row.typecode || null,
                        type_long: row.model || null,
                        manufacturer: row.manufacturername || null,
                        registration: row.registration || null,
                        owner: row.owner || row.operator || null,
                        operator_flag: row.operatoricao || null,
                    });
                    count++;
                }
            })
            .on('end', () => {
                console.log(`✅ Aircraft CSV loaded: ${aircraftDatabase.size} unique aircraft from ${count} rows`);
                resolve();
            })
            .on('error', (err) => {
                console.error(`❌ Failed to load aircraft CSV:`, err.message);
                reject(err);
            });
    });
}

function lookupAircraftByHex(icao24) {
    if (!icao24) return null;
    return aircraftDatabase.get(icao24.toLowerCase()) || null;
}

function isValidIata(code) {
    return typeof code === "string" && /^[A-Z]{3}$/.test(code.trim().toUpperCase());
}

function isValidIcao(code) {
    return typeof code === "string" && /^[A-Z]{4}$/.test(code.trim().toUpperCase());
}

function normalizeIata(code, fallback = "UNK") {
    const normalized = String(code || "").trim().toUpperCase();
    return isValidIata(normalized) ? normalized : fallback;
}

function normalizeIcao(code, fallback = "UNK") {
    const normalized = String(code || "").trim().toUpperCase();
    return isValidIcao(normalized) ? normalized : fallback;
}

function normalizeFlightCode(code) {
    const normalized = String(code || "").trim().toUpperCase();
    return /^[A-Z0-9]{3,8}$/.test(normalized) ? normalized : null;
}

function normalizeActiveFlightsPayload(input, fallbackAirport = TARGET_AIRPORT) {
    const nowIso = new Date().toISOString();

    function resolveFlightSchedule(flight) {
        const schedule = flight?.schedule && typeof flight.schedule === 'object' ? flight.schedule : {};
        const routeDetails = flight?.route?.details && typeof flight.route.details === 'object' ? flight.route.details : {};

        return {
            departure: {
                scheduled:
                    schedule.departure?.scheduled ??
                    routeDetails.scheduled_departure ??
                    flight?.departure?.scheduled ??
                    null,
                estimated:
                    schedule.departure?.estimated ??
                    routeDetails.estimated_departure ??
                    flight?.departure?.estimated ??
                    null,
                actual:
                    schedule.departure?.actual ??
                    routeDetails.actual_departure ??
                    flight?.departure?.actual ??
                    null,
            },
            arrival: {
                scheduled:
                    schedule.arrival?.scheduled ??
                    routeDetails.scheduled_arrival ??
                    flight?.arrival?.scheduled ??
                    null,
                estimated:
                    schedule.arrival?.estimated ??
                    routeDetails.estimated_arrival ??
                    flight?.arrival?.estimated ??
                    null,
                actual:
                    schedule.arrival?.actual ??
                    routeDetails.actual_arrival ??
                    flight?.arrival?.actual ??
                    null,
            },
        };
    }

    function enrichFlight(flight) {
        if (!flight || typeof flight !== 'object') return flight;

        const preservedFlight = { ...flight };
        preservedFlight.schedule = resolveFlightSchedule(flight);
        return preservedFlight;
    }

    if (Array.isArray(input)) {
        return {
            meta: {
                updated: nowIso,
                airport: normalizeIata(fallbackAirport, TARGET_AIRPORT),
                airport_icao: normalizeIcao(fallbackAirport, "UNK"),
                count: input.length,
            },
            flights: input.map(enrichFlight),
        };
    }

    if (!input || typeof input !== 'object') {
        return null;
    }

    const flights = Array.isArray(input.flights)
        ? input.flights.map(enrichFlight)
        : Array.isArray(input.data?.flights)
            ? input.data.flights.map(enrichFlight)
            : [];

    const meta = {
        ...(input.meta && typeof input.meta === 'object' ? input.meta : {}),
        updated: nowIso,
        airport: normalizeIata(input.meta?.airport || input.airport || fallbackAirport, TARGET_AIRPORT),
        airport_icao: normalizeIcao(input.meta?.airport_icao || input.airport_icao || input.airport || fallbackAirport, "UNK"),
        count: flights.length,
    };

    const preservedTopLevel = { ...input };
    delete preservedTopLevel.meta;
    delete preservedTopLevel.flights;

    return {
        ...preservedTopLevel,
        meta,
        flights,
    };
}

// Load the key mapping configuration for transforming frontend data
const keyMapping = require('./KeyMapping.json');

// Load the AerotwinConfig to get task templates
const aerotwinConfig = require('./AerotwinConfig.json');

// Helper function to get tasks template based on checkpoint type and feature value
function getTasksForCheckpoint(checkpointType, featureVal, avgServiceTime) {
    const checkpoints = aerotwinConfig.Checkpoints;
    
    for (const checkpoint of checkpoints) {
        if (checkpoint.Checkpoint_Type === checkpointType || 
            (checkpointType.includes("Check-in") && checkpoint.Checkpoint_Type === "Checkin")) {
            
            // For Security checkpoints, match by Feature_Val or Avg_Service_Time
            if (checkpointType === "Security") {
                // Default to full security screening (Security_2)
                // Only use simple security (Security_1) if Feature_Val explicitly set to 1
                const isSimpleScreening = featureVal === 1;
                
                // Find Security_1 or Security_2 based on screening type
                const targetCheckpoint = isSimpleScreening ? 
                    checkpoints.find(cp => cp.Checkpoint_ID === "Security_1") :
                    checkpoints.find(cp => cp.Checkpoint_ID === "Security_2");
                
                if (targetCheckpoint && targetCheckpoint.Stations[0]) {
                    return targetCheckpoint.Stations[0].Tasks || [];
                }
            } else {
                // For other checkpoint types, return tasks from first station
                const station = checkpoint.Stations[0];
                return station && station.Tasks ? station.Tasks : [];
            }
        }
    }
    
    return [];
}
//ACTIVE FLIGHTS
function resolvePlaneType(flightIata, apiPlane) {
    // If API provides it, use it. Otherwise, mark it Dummy.
    if (apiPlane) return apiPlane;
    
    const fleet = { MS: ["B738", "A320"], FZ: ["B38M"], G9: ["A320"], SV: ["A333"] };
    const airline = flightIata?.substring(0, 2).toUpperCase();
    const fleetMatch = fleet[airline];
    const fallback = fleetMatch ? fleetMatch[Math.floor(Math.random() * fleetMatch.length)] : "A320";
    
    return `${fallback} (Dummy)`;
}
// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

// ==========================================
// AUTH MIDDLEWARE & TOKEN BLACKLIST
// ==========================================
const tokenBlacklist = new Set();

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    if (tokenBlacklist.has(token)) {
        return res.status(401).json({ error: 'Token has been invalidated.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        req.token = token;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

// FLEET INTELLIGENCE (For filling nulls)
const fleetDatabase = {
  MS: ["B738", "A320", "A220"],
  FZ: ["B38M", "B738"],
  G9: ["A320", "A321"],
  SV: ["A320", "A321", "A333"],
  J9: ["A320"],
  TK: ["B738", "A321"],
  W6: ["A321", "A21N"],
  AT: ["AT72"],
};


// ==========================================
// 1. FORMATTING ENDPOINT FOR DIGITAL TWIN
// ==========================================

// Recursive function to deeply map keys inside nested arrays/objects
function mapKeysDeep(data, mapping) {
    if (Array.isArray(data)) {
        return data.map(item => mapKeysDeep(item, mapping));
    } else if (data !== null && typeof data === 'object') {
        const formattedObj = {};
        for (const [key, value] of Object.entries(data)) {
            // Check if key is in config, otherwise keep original
            const mappedKey = mapping[key] || key;
            // Recursively format the value
            formattedObj[mappedKey] = mapKeysDeep(value, mapping);
        }
        return formattedObj;
    }
    return data;
}

app.post('/api/format-aerotwin-data', (req, res) => {
    try {
        const incomingData = Array.isArray(req.body) ? req.body : [];
        const normalizedIncoming = incomingData.map((checkpoint) => ({
            ...checkpoint,
            flowType: checkpoint.flowType === 'arrival' ? 'arrival' : 'departure'
        }));
        
        console.log("\n=== INCOMING DATA DEBUG ===");
        console.log("Number of checkpoints:", normalizedIncoming.length);
        normalizedIncoming.forEach(cp => {
            console.log(`  [${cp.flowType}] ${cp.idCode}: nextCheckpointIds =`, cp.nextCheckpointIds);
        });
        
        // Step 0: Create mapping from frontend checkpoint IDs to their Checkpoint_ID (idCode)
        const frontendIdToCheckpointId = {};
        const frontendIdToFlowType = {};
        normalizedIncoming.forEach(checkpoint => {
            frontendIdToCheckpointId[checkpoint.id] = checkpoint.idCode;
            frontendIdToFlowType[checkpoint.id] = checkpoint.flowType;
        });

        console.log("\nFrontend ID to Checkpoint ID mapping:", frontendIdToCheckpointId);
        
        // Step 1: Pass the deeply nested payload through the recursive formatter
        let finalPayload = mapKeysDeep(normalizedIncoming, keyMapping);

        // Ensure finalPayload is an array of checkpoints
        if (!Array.isArray(finalPayload)) {
            finalPayload = [];
        }

        // Step 2: Build a mapping of checkpoint ID to next checkpoint IDs (array for forks), split by flow
        const checkpointNextMapByFlow = {
            departure: {},
            arrival: {}
        };

        normalizedIncoming.forEach((checkpoint) => {
            const flowType = checkpoint.flowType === 'arrival' ? 'arrival' : 'departure';

            if (checkpoint.nextCheckpointIds && Array.isArray(checkpoint.nextCheckpointIds) && checkpoint.nextCheckpointIds.length > 0) {
                // Convert ALL frontend IDs to actual Checkpoint_IDs (handle forks)
                const nextCheckpointIds = checkpoint.nextCheckpointIds
                    .map(frontendNextId => {
                        const mapped = frontendIdToCheckpointId[frontendNextId];
                        const targetFlowType = frontendIdToFlowType[frontendNextId] || 'departure';

                        if (targetFlowType !== flowType) {
                            console.log(`  Ignoring cross-flow connection ${checkpoint.idCode} -> ${mapped} (${flowType} -> ${targetFlowType})`);
                            return null;
                        }

                        console.log(`  [${flowType}] Mapping frontend ID "${frontendNextId}" → "${mapped}"`);
                        return mapped;
                    })
                    .filter(id => id); // Remove undefined values
                
                console.log(`  [${flowType}] ${checkpoint.idCode} will have Next_Anchor:`, nextCheckpointIds);
                
                if (nextCheckpointIds.length > 0) {
                    checkpointNextMapByFlow[flowType][checkpoint.idCode] = nextCheckpointIds;
                }
            }
        });

        console.log("\nFinal Checkpoint next mapping by flow:", JSON.stringify(checkpointNextMapByFlow, null, 2));

        const processFlowPayload = (flowPayload, flowType, checkpointNextMap) => {
            const entryAnchor = flowType === 'arrival' ? 'Boarding_Gate' : 'Terminal_Entrance';
            const exitAnchor = flowType === 'arrival' ? 'Terminal_Exit' : 'Boarding_Gate';
            const hasExplicitConnections = Object.keys(checkpointNextMap).length > 0;
            const previousAnchorMap = {};

            console.log(`\n=== Processing ${flowType.toUpperCase()} flow (${flowPayload.length} checkpoints) ===`);
            console.log(`[${flowType}] Has explicit connections:`, hasExplicitConnections);

            if (hasExplicitConnections) {
                Object.entries(checkpointNextMap).forEach(([currentId, nextIds]) => {
                    nextIds.forEach(nextId => {
                        previousAnchorMap[nextId] = currentId;
                    });
                });
            } else {
                console.log(`[${flowType}] No explicit connections found, using sequential order`);
                for (let i = 1; i < flowPayload.length; i++) {
                    previousAnchorMap[flowPayload[i].Checkpoint_ID] = flowPayload[i - 1].Checkpoint_ID;
                }
            }

            const referencedCheckpoints = new Set();
            Object.values(checkpointNextMap).forEach(nextIds => {
                nextIds.forEach(id => referencedCheckpoints.add(id));
            });

            const terminalCheckpoints = flowPayload
                .map(cp => cp.Checkpoint_ID)
                .filter(id => !referencedCheckpoints.has(id) && id !== flowPayload[0]?.Checkpoint_ID);

            console.log(`[${flowType}] Previous anchor mapping:`, previousAnchorMap);
            console.log(`[${flowType}] Terminal checkpoints (will point to ${exitAnchor}):`, terminalCheckpoints);

            return flowPayload.map((checkpoint, index) => {
                const checkpointId = checkpoint.Checkpoint_ID;

                console.log(`\n[${flowType}] Processing checkpoint: ${checkpointId} (index: ${index})`);

                if (index === 0) {
                    checkpoint.Prev_Anchor = entryAnchor;
                    console.log(`  → Prev_Anchor: "${entryAnchor}" (first checkpoint)`);
                } else if (previousAnchorMap[checkpointId]) {
                    checkpoint.Prev_Anchor = previousAnchorMap[checkpointId];
                    console.log(`  → Prev_Anchor: "${previousAnchorMap[checkpointId]}" (from mapping)`);
                } else {
                    checkpoint.Prev_Anchor = entryAnchor;
                    console.log(`  → Prev_Anchor: "${entryAnchor}" (fallback)`);
                }

                if (hasExplicitConnections && checkpointNextMap[checkpointId]) {
                    checkpoint.Next_Anchor = checkpointNextMap[checkpointId];
                    console.log(`  → Next_Anchor:`, checkpoint.Next_Anchor, "(from explicit mapping)");
                } else if (hasExplicitConnections && terminalCheckpoints.includes(checkpointId)) {
                    checkpoint.Next_Anchor = [exitAnchor];
                    console.log(`  → Next_Anchor: ["${exitAnchor}"] (terminal checkpoint)`);
                } else if (!hasExplicitConnections) {
                    if (index < flowPayload.length - 1) {
                        checkpoint.Next_Anchor = [flowPayload[index + 1].Checkpoint_ID];
                        console.log(`  → Next_Anchor: [${flowPayload[index + 1].Checkpoint_ID}] (sequential)`);
                    } else {
                        checkpoint.Next_Anchor = [exitAnchor];
                        console.log(`  → Next_Anchor: ["${exitAnchor}"] (last in sequence)`);
                    }
                } else {
                    checkpoint.Next_Anchor = [exitAnchor];
                    console.log(`  → Next_Anchor: ["${exitAnchor}"] (default)`);
                }

                const stations = (checkpoint.Stations || []).map(station => {
                    const { Checkpoint_ID, Station_Name, ...rest } = station;

                    const tasks = getTasksForCheckpoint(
                        checkpoint.Checkpoint_Type,
                        rest.Feature_Val || 0,
                        rest.Avg_Service_Time
                    );

                    return {
                        Station_ID: Station_Name,
                        ...rest,
                        Tasks: tasks
                    };
                });

                const ordered = {};
                ordered.Checkpoint_ID = checkpoint.Checkpoint_ID;
                ordered.Checkpoint_Type = checkpoint.Checkpoint_Type;
                ordered.Flow_Type = flowType;
                if (checkpoint.Prev_Anchor) ordered.Prev_Anchor = checkpoint.Prev_Anchor;
                if (checkpoint.Next_Anchor) ordered.Next_Anchor = checkpoint.Next_Anchor;
                ordered.Stations = stations;

                return ordered;
            });
        };

        const departurePayload = finalPayload.filter(cp => cp.Flow_Type !== 'arrival');
        const arrivalPayload = finalPayload.filter(cp => cp.Flow_Type === 'arrival');

        const formattedDeparture = processFlowPayload(departurePayload, 'departure', checkpointNextMapByFlow.departure);
        const formattedArrival = processFlowPayload(arrivalPayload, 'arrival', checkpointNextMapByFlow.arrival);
        finalPayload = [...formattedDeparture, ...formattedArrival];

        console.log("✅ Successfully formatted deeply nested payload from frontend");
        console.log("📊 Checkpoints processed:", finalPayload.length);
        console.log("📤 Formatted output:", JSON.stringify(finalPayload, null, 2));

        // Wrap each flow as its own top-level item
        const formattedResponse = {
            Departure: {
                Checkpoints: formattedDeparture
            },
            Arrival: {
                Checkpoints: formattedArrival
            }
        };

        res.status(200).json({
            success: true,
            data: formattedResponse,
            checkpointsProcessed: finalPayload.length
        });

    } catch (error) {
        console.error("Formatting error:", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// Mock data fallback for when external APIs are unavailable
const MOCK_FLIGHT_DATA = {
    meta: {
        updated: new Date().toISOString(),
        airport: TARGET_AIRPORT,
        airport_icao: "HEBA",
        count: 24,
        arrivals_fetched: 12,
        departures_fetched: 12,
        status_counts: {
            scheduled: 8,
            active: 6,
            landed: 8,
            diverted: 1,
            cancelled: 1,
            incident: 0,
            unknown: 0
        },
        flight_status_breakdown: {},
        opensky_enriched: 5,
        opensky_aircraft_nearby: 3,
        aircraft_sources: {
            csv_db: 10,
            aviationstack: 8,
            dummy: 6
        }
    },
    flights: generateMockFlights()
};

function generateMockFlights() {
    const airlines = ['EgyptAir', 'Air Arabia', 'Flydubai', 'SaudiGulf', 'Nile Air'];
    const statuses = ['scheduled', 'active', 'landed', 'diverted', 'cancelled'];
    const types = ['A320', 'B738', 'A321', 'A220', 'B38M'];
    const routes = [
        { src: 'CAI', dest: 'HBE' },
        { src: 'SSH', dest: 'HBE' },
        { src: 'HBE', dest: 'DXB' },
        { src: 'JED', dest: 'HBE' },
        { src: 'AUH', dest: 'HBE' }
    ];

    return Array.from({ length: 24 }, (_, i) => {
        const route = routes[i % routes.length];
        const status = statuses[i % statuses.length];
        const type = types[i % types.length];
        const capacity = { A320: 180, B738: 189, A321: 220, A220: 135, B38M: 189 }[type] || 180;

        return {
            flight_id: `MS${1000 + i}`,
            flight_iata: `MS${1000 + i}`,
            flight_icao: `MSR${1000 + i}`,
            airline: airlines[i % airlines.length],
            airline_iata: ['MS', 'G9', 'FZ', 'XY', 'NP'][i % 5],
            flight_status: status,
            flight_type: 'International',
            route: {
                source: route.src,
                destination: route.dest,
                details: {
                    gate_id: `T${(i % 2) + 1}-G${(i % 12) + 1}`,
                    scheduled_arrival: new Date(Date.now() + (i - 12) * 30 * 60000).toISOString()
                }
            },
            aircraft: {
                type: type,
                type_source: 'Mock',
                capacity: `${capacity} (Mock)`
            },
            payload_stats: {
                total_passengers: `${Math.floor(capacity * 0.85)} (Simulated)`,
                estimated_groups: `${Math.ceil(capacity * 0.85 / 2.4)} (Simulated)`,
                total_bags: `${Math.round(capacity * 0.85 * 0.8)} (Simulated)`
            }
        };
    });
}

app.get('/api/fetch-active-flights', async (req, res) => {
    try {
        const requestedAirport = String(req.query.airport || TARGET_AIRPORT).trim().toUpperCase();
        const flightStatus = req.query.status || 'active';

        const requestedIata = normalizeIata(requestedAirport, "");
        const requestedIcao = normalizeIcao(requestedAirport, "");
        const airportIata = requestedIata || TARGET_AIRPORT;
        const airportIcao = requestedIcao || "UNK";

        // Build flight query parameters
        const buildFlightQueryParams = (direction) => {
            const params = { access_key: API_KEY };

            if (requestedIcao) {
                params[`${direction}_icao`] = requestedIcao;
            } else {
                params[`${direction}_iata`] = airportIata;
            }

            if (flightStatus !== 'all') {
                params.flight_status = flightStatus;
            }

            return params;
        };

        // Hoist these so they're accessible after the try-catch
        let arrivalsRaw = [];
        let departuresRaw = [];
        let openskyStates = [];
        let openskyArrivals = [];
        let openskyRecentFlights = [];

        try {
            // Fetch AviationStack + ALL OpenSky sources in parallel
            const airportCoords = AIRPORT_COORDINATES[airportIata];
            const [aviationStackArrivalsRes, aviationStackDeparturesRes, liveStates, historicArrivals, recentFlights] = await Promise.all([
                axios.get(API_URL, { params: buildFlightQueryParams('arr') }),
                axios.get(API_URL, { params: buildFlightQueryParams('dep') }),
                airportCoords
                    ? fetchOpenSkyLiveNearAirport(airportIata, airportCoords)
                    : Promise.resolve([]),
                fetchOpenSkyArrivals(airportIata, 48).catch(() => []),
                fetchOpenSkyRecentFlights().catch(() => []),
            ]);

            arrivalsRaw        = aviationStackArrivalsRes.data?.data || [];
            departuresRaw      = aviationStackDeparturesRes.data?.data || [];
            openskyStates      = liveStates;
            openskyArrivals    = historicArrivals;
            openskyRecentFlights = recentFlights;

            // Check if we got any real data - if not, use mock data
            if (arrivalsRaw.length === 0 && departuresRaw.length === 0) {
                console.log("⚠️ No flights from API, using mock data");
                const mockData = { ...MOCK_FLIGHT_DATA };
                mockData.meta = {
                    ...mockData.meta,
                    airport: airportIata,
                    airport_icao: airportIcao,
                    updated: new Date().toISOString()
                };
                return res.status(200).json(mockData);
            }
        } catch (apiError) {
            console.log("⚠️ API fetch failed, using mock data:", apiError.message);
            const mockData = { ...MOCK_FLIGHT_DATA };
            mockData.meta = {
                ...mockData.meta,
                airport: airportIata,
                airport_icao: airportIcao,
                updated: new Date().toISOString()
            };
            return res.status(200).json(mockData);
        }

        // Process fetched data (only runs if API returned data)
        const dedupeKeys = new Set();
        const rawFlights = [];

        for (const flight of [...arrivalsRaw, ...departuresRaw]) {
            const depCode = (flight?.departure?.icao || flight?.departure?.iata || 'UNK').toUpperCase();
            const arrCode = (flight?.arrival?.icao || flight?.arrival?.iata || 'UNK').toUpperCase();
            const arrTime = flight?.arrival?.estimated || flight?.arrival?.scheduled || flight?.arrival?.actual || 'UNK';

            // Operational-flight signature: source + destination + ETA collapses codeshares with different IDs.
            const key = [depCode, arrCode, arrTime].join('|');

            if (dedupeKeys.has(key)) continue;
            dedupeKeys.add(key);
            rawFlights.push(flight);
        }

        // Build lookups from ALL OpenSky sources
        const callsignLookup = buildCallsignLookup(openskyStates); // for live position data
        const callsignToHexMap = buildCallsignToHexMap(openskyStates, openskyArrivals, openskyRecentFlights);
        console.log(`🗺️  Callsign→icao24 map: ${callsignToHexMap.size} entries (live: ${openskyStates.length}, arrivals: ${openskyArrivals.length}, recent: ${openskyRecentFlights.length})`);

        let openskyMatches = 0;
        let hexdbResolved = 0;
        let dummyCount = 0;
        let aviationStackCount = 0;
        let csvDbCount = 0;

        // Step 1: For each flight, resolve icao24 from ANY OpenSky source
        const flightsWithMatches = rawFlights.map(f => {
            const flightIata = normalizeFlightCode(f.flight?.iata);
            const flightIcao = normalizeFlightCode(f.flight?.icao);
            const flightId = flightIata || flightIcao || "UNKNOWN_FLIGHT";

            // Try to get live position data
            const openskyMatch = matchFlightToOpenSky(flightId, callsignLookup);

            // Resolve icao24 from ANY source (live, arrivals, or recent flights)
            let icao24 = openskyMatch?.icao24 || resolveIcao24(flightId, callsignToHexMap);

            // Also check if AviationStack provides icao24 directly
            if (!icao24 && f.aircraft?.icao24) {
                icao24 = f.aircraft.icao24;
            }

            if (icao24) openskyMatches++;
            return { raw: f, flightIata, flightIcao, flightId, openskyMatch, icao24 };
        });

        // Step 2: Local CSV lookups for ALL resolved icao24 addresses (instant)
        const uniqueHexes = [...new Set(
            flightsWithMatches
                .filter(f => f.icao24)
                .map(f => f.icao24)
        )];
        console.log(`🔎 CSV DB: Looking up ${uniqueHexes.length} unique icao24 addresses...`);
        const hexMap = new Map();
        uniqueHexes.forEach(hex => {
            const result = lookupAircraftByHex(hex);
            if (result) hexMap.set(hex, result);
        });
        console.log(`✅ CSV DB: Resolved ${hexMap.size}/${uniqueHexes.length} aircraft identities`);

        // Step 3: Build final flight objects with full enrichment
        const formattedFlights = flightsWithMatches.map(({ raw: f, flightIata, flightIcao, flightId, openskyMatch, icao24 }) => {
            const aircraftRaw = f.aircraft?.iata;
            let aircraftCode = resolvePlaneType(f.flight.iata, aircraftRaw);
            let aircraftSource = aircraftRaw ? "AviationStack" : "Dummy";

            // --- CSV DB: Override aircraft type with real data if available ---
            const hexData = icao24 ? hexMap.get(icao24) : null;
            if (hexData?.icao_type) {
                aircraftCode = hexData.icao_type;
                aircraftSource = "CSV_DB";
                hexdbResolved++;
                csvDbCount++;
            } else if (aircraftSource === "AviationStack") {
                aviationStackCount++;
            } else {
                dummyCount++;
            }

            const lookupCode = aircraftCode.split(' ')[0];
            const maxCapacity = AIRCRAFT_CAPACITIES[lookupCode] || 180;
            
            const loadFactor = (Math.random() * (0.20) + 0.75);
            const estimatedPax = Math.floor(maxCapacity * loadFactor);

            const sourceIata = normalizeIata(f.departure?.iata);
            const sourceIcao = normalizeIcao(f.departure?.icao);
            const destinationIata = normalizeIata(f.arrival?.iata);
            const destinationIcao = normalizeIcao(f.arrival?.icao);
            const isDomestic = DOMESTIC_EGYPT_AIRPORTS.includes(sourceIata);
            const flightType = isDomestic ? "Domestic" : "International";

            const airlineName = f.airline?.name || "Unknown Airline";
            const terminal = (airlineName.includes("EgyptAir")) ? "T1" : "T2";
            const gate = f.arrival?.gate ? f.arrival.gate : `${terminal}-G${Math.floor(Math.random() * 12) + 1} (Dummy)`;
            const belt = f.arrival?.baggage ? f.arrival.baggage : `B${Math.floor(Math.random() * 4) + 1} (Dummy)`;

            const flightObj = {
                flight_id: flightId,
                flight_iata: flightIata,
                flight_icao: flightIcao,
                airline: airlineName,
                airline_iata: f.airline?.iata || null,
                airline_icao: f.airline?.icao || null,
                airline_logo: f.airline?.iata ? `/airline-logos/${f.airline.iata}.png` : null,
                flight_status: f.flight_status || "unknown",
                flight_type: flightType,
                
                route: {
                    source: sourceIata,
                    source_icao: sourceIcao,
                    destination: destinationIata,
                    destination_icao: destinationIcao,
                    details: {
                        origin_name: f.departure?.airport || "Unknown Departure",
                        terminal: terminal,
                        gate_id: gate,
                        scheduled_arrival: f.arrival?.scheduled || null,
                        estimated_arrival: f.arrival?.estimated || null,
                        actual_arrival: f.arrival?.actual || null,
                        scheduled_departure: f.departure?.scheduled || null,
                        estimated_departure: f.departure?.estimated || null,
                        actual_departure: f.departure?.actual || null,
                    }
                },
                
                aircraft: { 
                    type: aircraftCode,
                    type_source: aircraftSource,
                    capacity: `${maxCapacity} (Simulated)`,
                    ...(hexData ? {
                        manufacturer: hexData.manufacturer,
                        registration: hexData.registration,
                        owner: hexData.owner,
                        type_long: hexData.type_long,
                    } : {})
                },

                payload_stats: {
                    total_passengers: `${estimatedPax} (Simulated)`,
                    estimated_groups: `${Math.ceil(estimatedPax / 2.4)} (Simulated)`,
                    total_bags: `${Math.round(estimatedPax * (isDomestic ? 0.4 : 1.2))} (Simulated)`,
                    priority_pax: `${Math.round(estimatedPax * 0.12)} (Simulated)`,
                    prm_pax: `${Math.floor(Math.random() * 3)} (Simulated)`,
                    service_multiplier: isDomestic ? 1.0 : 1.4,
                    assigned_resources: { baggage_belt: belt }
                },

                origin_coords: AIRPORT_COORDINATES[sourceIata]?.coords || null,
                dest_coords: AIRPORT_COORDINATES[destinationIata]?.coords || null,
            };

            // Attach live OpenSky position if matched
            if (openskyMatch) {
                flightObj.opensky_live = {
                    icao24: openskyMatch.icao24,
                    callsign: openskyMatch.callsign,
                    latitude: openskyMatch.latitude,
                    longitude: openskyMatch.longitude,
                    altitude_m: openskyMatch.baro_altitude,
                    geo_altitude_m: openskyMatch.geo_altitude,
                    velocity_mps: openskyMatch.velocity,
                    heading: openskyMatch.true_track,
                    vertical_rate_mps: openskyMatch.vertical_rate,
                    on_ground: openskyMatch.on_ground,
                    squawk: openskyMatch.squawk,
                    origin_country: openskyMatch.origin_country,
                };
            }

            return flightObj;
        });

        console.log(`🔗 OpenSky enrichment: ${openskyMatches}/${formattedFlights.length} flights matched`);
        console.log(`✈️  CSV DB aircraft resolved: ${csvDbCount}/${formattedFlights.length} | AviationStack: ${aviationStackCount} | Dummy: ${dummyCount}`);

        // All possible flight statuses (matching frontend filters)
        const ALL_STATUSES = ["scheduled", "active", "landed", "cancelled", "incident", "diverted", "unknown"];
        
        // Count flights by status with aircraft source breakdown
        const statusCounts = {};
        ALL_STATUSES.forEach(s => {
            statusCounts[s] = { count: 0, csv_db: 0, aviationstack: 0, dummy: 0 };
        });
        formattedFlights.forEach(f => {
            const status = f.flight_status || "unknown";
            const source = f.aircraft?.type_source || "unknown";
            if (!statusCounts[status]) {
                statusCounts[status] = { count: 0, csv_db: 0, aviationstack: 0, dummy: 0 };
            }
            statusCounts[status].count++;
            if (source === "CSV_DB") statusCounts[status].csv_db++;
            else if (source === "AviationStack") statusCounts[status].aviationstack++;
            else statusCounts[status].dummy++;
        });
        console.log(`📊 Flight status breakdown:`, JSON.stringify(statusCounts, null, 2));

        // Simple count per status for frontend badges
        const statusCountsSimple = {};
        ALL_STATUSES.forEach(s => {
            statusCountsSimple[s] = statusCounts[s].count;
        });

        const finalPayload = {
            meta: { 
                updated: new Date().toISOString(), 
                airport: airportIata,
                airport_icao: airportIcao,
                count: formattedFlights.length,
                arrivals_fetched: arrivalsRaw.length,
                departures_fetched: departuresRaw.length,
                status_counts: statusCountsSimple,
                flight_status_breakdown: statusCounts,
                opensky_enriched: openskyMatches,
                opensky_aircraft_nearby: openskyStates.length,
                aircraft_sources: {
                    csv_db: csvDbCount,
                    aviationstack: aviationStackCount,
                    dummy: dummyCount,
                },
            },
            flights: formattedFlights
        };

        // ── Persist to TimescaleDB (non-blocking) ──────────────────────────────
        db.insertFlightSnapshots(airportIata, formattedFlights).catch((err) => {
            console.warn('⚠️  [DB] Flight snapshot insert skipped:', err.message);
        });

        res.status(200).json(finalPayload);

    } catch (error) {
        console.error("Fetch Error:", error);
        res.status(500).json({ error: "Failed to fetch active flights." });
    }
});

app.post('/api/save-active-flights', (req, res) => {
    try {
        const airport = String(req.body?.airport || TARGET_AIRPORT).trim().toUpperCase();
        const payload = normalizeActiveFlightsPayload(req.body, airport);

        if (!payload || !Array.isArray(payload.flights) || payload.flights.length === 0) {
            return res.status(400).json({ error: 'No flights provided for export.' });
        }

        payload.meta = {
            ...(payload.meta || {}),
            source: payload.meta?.source || "frontend-export",
        };

        fs.writeFileSync("active_flights.json", JSON.stringify(payload, null, 2));

        // ── Persist to TimescaleDB (non-blocking) ──────────────────────────────
        db.insertFlightSnapshots(airport, payload.flights).catch((err) => {
            console.warn('⚠️  [DB] Flight snapshot insert (save) skipped:', err.message);
        });

        return res.status(200).json({ success: true, path: "active_flights.json", count: payload.flights.length });
    } catch (error) {
        console.error("Save active flights error:", error.message);
        return res.status(500).json({ error: 'Failed to save active flights JSON.' });
    }
});

app.post('/api/airports-batch', async (req, res) => {
    try {
        const incomingCodes = Array.isArray(req.body?.codes) ? req.body.codes : [];
        const normalizedCodes = Array.from(new Set(
            incomingCodes
                .map((code) => String(code || '').trim().toUpperCase())
                .filter((code) => code.length >= 3)
        ));

        if (normalizedCodes.length === 0) {
            return res.status(200).json({ count: 0, airports: {} });
        }

        // Split into cached vs uncached — only resolve uncached codes via API
        const cachedCodes = normalizedCodes.filter((code) => airportLookupCache.has(code));
        const uncachedCodes = normalizedCodes.filter((code) => !airportLookupCache.has(code));

        console.log(`🛫 Airport batch: ${normalizedCodes.length} requested | ${cachedCodes.length} cached (free) | ${uncachedCodes.length} need API`);

        // Resolve only the uncached codes via API (saves credits)
        if (uncachedCodes.length > 0) {
            await Promise.all(uncachedCodes.map((code) => resolveAirportLocation(code)));
        }

        // Build result from the full cache (which now includes any newly resolved codes)
        const airports = normalizedCodes.reduce((acc, code) => {
            const airport = airportLookupCache.get(code);
            if (airport && Array.isArray(airport.coords) && airport.coords.length === 2) {
                acc[airport.code] = airport;
            }
            return acc;
        }, {});

        const creditsSaved = cachedCodes.length;
        const creditsUsed = uncachedCodes.length;
        console.log(`💰 Airport batch result: ${Object.keys(airports).length} resolved | ${creditsSaved} credits saved | ${creditsUsed} credits used`);

        return res.status(200).json({ count: Object.keys(airports).length, airports, credits_saved: creditsSaved, credits_used: creditsUsed });
    } catch (error) {
        console.error('Batch airport lookup error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch airport batch.' });
    }
});

app.get('/api/airport-location', async (req, res) => {
    try {
        const airportCode = String(req.query.airport || TARGET_AIRPORT).trim().toUpperCase();

        if (!airportCode) {
            return res.status(400).json({ error: 'Airport code is required.' });
        }

        const resolvedAirport = await resolveAirportLocation(airportCode);
        if (!resolvedAirport) {
            return res.status(404).json({ error: `No coordinates found for ${airportCode}.` });
        }

        return res.status(200).json(resolvedAirport);
    } catch (error) {
        console.error('Airport lookup error:', error.message);
        res.status(500).json({ error: 'Failed to fetch airport location.' });
    }
});
// ==========================================
// 4. OPENSKY NETWORK ENDPOINTS
// ==========================================

// Live aircraft near airport (real-time state vectors)
app.get('/api/opensky/live', async (req, res) => {
    try {
        const airportCode = (req.query.airport || TARGET_AIRPORT).toUpperCase();
        const airportCoords = AIRPORT_COORDINATES[airportCode];

        if (!airportCoords) {
            return res.status(400).json({
                error: `No coordinates configured for airport "${airportCode}". Add it to AIRPORT_COORDINATES.`
            });
        }

        const states = await fetchOpenSkyLiveNearAirport(airportCode, airportCoords);

        res.status(200).json({
            meta: {
                updated: new Date().toISOString(),
                airport: airportCode,
                aircraft_count: states.length,
                bounding_box: {
                    lat: [airportCoords.coords[0] - 0.5, airportCoords.coords[0] + 0.5],
                    lon: [airportCoords.coords[1] - 0.5, airportCoords.coords[1] + 0.5],
                },
            },
            aircraft: states,
        });
    } catch (error) {
        console.error("OpenSky live error:", error.message);
        res.status(500).json({ error: "Failed to fetch live OpenSky data." });
    }
});

// Historical arrivals at airport (batch-processed, previous day onward)
app.get('/api/opensky/arrivals', async (req, res) => {
    try {
        const airportCode = (req.query.airport || TARGET_AIRPORT).toUpperCase();
        const hoursBack = Math.min(parseInt(req.query.hours) || 48, 168);

        const arrivals = await fetchOpenSkyArrivals(airportCode, hoursBack);

        res.status(200).json({
            meta: {
                updated: new Date().toISOString(),
                airport: airportCode,
                hours_queried: hoursBack,
                arrival_count: arrivals.length,
            },
            arrivals,
        });
    } catch (error) {
        console.error("OpenSky arrivals error:", error.message);
        res.status(500).json({ error: "Failed to fetch OpenSky arrivals." });
    }
});

// ==========================================
// 5. FULL-TEXT SEARCH ENDPOINT
// ==========================================

/**
 * GET /api/search?q=<term>&type=all|airports|aircraft|flights&limit=20
 *
 * Searches across:
 *   • airports_full     — 85k airports (name, IATA, ICAO, city, country)
 *   • aircraft_registry — 520k aircraft (registration, type, manufacturer, operator)
 *   • flight_snapshots  — historical flights (flight number, airline, route)
 *
 * All three queries run in parallel using GIN full-text indexes.
 */
app.get('/api/search', async (req, res) => {
    try {
        const term  = String(req.query.q || '').trim();
        const type  = ['all','airports','aircraft','flights'].includes(req.query.type)
            ? req.query.type : 'all';
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

        if (term.length < 2) {
            return res.status(400).json({ error: 'Query must be at least 2 characters.' });
        }

        const results = await db.fullSearch(term, { type, limit });
        return res.status(200).json(results);
    } catch (err) {
        console.error('[Search] error:', err.message);
        return res.status(500).json({ error: 'Search failed.' });
    }
});

// ==========================================
// 6. TIMESCALEDB ANALYTICS ENDPOINTS
// ==========================================

/**
 * GET /api/analytics/flights?airport=HBE&hours=24
 * Returns raw flight snapshot rows for the given airport and time window.
 */
app.get('/api/analytics/flights', async (req, res) => {
    try {
        const airport = String(req.query.airport || TARGET_AIRPORT).trim().toUpperCase();
        const hours = Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 720);
        const rows = await db.getFlightSnapshots(airport, hours);
        return res.status(200).json({
            meta: { airport, hours_back: hours, count: rows.length, updated: new Date().toISOString() },
            snapshots: rows,
        });
    } catch (err) {
        console.error('[Analytics] flights error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch flight analytics.' });
    }
});

/**
 * GET /api/analytics/status-trend?airport=HBE&hours=6
 * Returns hourly flight status counts (time_bucket aggregation).
 */
app.get('/api/analytics/status-trend', async (req, res) => {
    try {
        const airport = String(req.query.airport || TARGET_AIRPORT).trim().toUpperCase();
        const hours = Math.min(Math.max(parseInt(req.query.hours) || 6, 1), 168);
        const rows = await db.getStatusTrend(airport, hours);
        return res.status(200).json({
            meta: { airport, hours_back: hours, updated: new Date().toISOString() },
            trend: rows,
        });
    } catch (err) {
        console.error('[Analytics] status-trend error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch status trend.' });
    }
});

/**
 * GET /api/analytics/queue?airport=HBE&hours=1
 * Returns 5-minute-bucket queue wait history for all checkpoints.
 */
app.get('/api/analytics/queue', async (req, res) => {
    try {
        const airport = String(req.query.airport || TARGET_AIRPORT).trim().toUpperCase();
        const hours = Math.min(Math.max(parseFloat(req.query.hours) || 1, 0.08), 168);
        const rows = await db.getQueueHistory(airport, hours);
        return res.status(200).json({
            meta: { airport, hours_back: hours, updated: new Date().toISOString() },
            queue_history: rows,
        });
    } catch (err) {
        console.error('[Analytics] queue history error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch queue history.' });
    }
});

/**
 * POST /api/analytics/queue
 * Body: { airport: "HBE", results: [ CheckpointResult, … ] }
 * Called from the frontend QueueWaitEstimator to persist a queue snapshot.
 */
app.post('/api/analytics/queue', async (req, res) => {
    try {
        const airport = String(req.body?.airport || TARGET_AIRPORT).trim().toUpperCase();
        const results = Array.isArray(req.body?.results) ? req.body.results : [];
        if (results.length === 0) {
            return res.status(400).json({ error: 'No checkpoint results provided.' });
        }
        await db.insertQueueSnapshot(airport, results);
        return res.status(201).json({ success: true, airport, count: results.length });
    } catch (err) {
        console.error('[Analytics] queue insert error:', err.message);
        return res.status(500).json({ error: 'Failed to save queue snapshot.' });
    }
});

// ==========================================
// 7. AUTH ENDPOINTS
// ==========================================

/**
 * POST /api/signup
 * Body: { username, full_name, email, password }
 * Creates a new user account. Returns the user without password_hash.
 */
app.post('/api/signup', async (req, res) => {
    try {
        const { username, full_name, email, password } = req.body || {};

        // Validate required fields
        if (!username || !full_name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required: username, full_name, email, password.' });
        }

        if (typeof username !== 'string' || username.trim().length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters.' });
        }

        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof email !== 'string' || !emailRegex.test(email.trim())) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }

        // Check for duplicate username
        const existingUsername = await db.findUserByUsername(username.trim());
        if (existingUsername) {
            return res.status(409).json({ error: 'Username already taken.' });
        }

        // Check for duplicate email
        const existingEmail = await db.findUserByEmail(email.trim());
        if (existingEmail) {
            return res.status(409).json({ error: 'Email already registered.' });
        }

        // Hash password and create user
        const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
        const user = await db.createUser(username.trim(), full_name.trim(), email.trim(), passwordHash);

        console.log(`✅ [Auth] User created: ${user.username} (id: ${user.id})`);
        return res.status(201).json({ success: true, user });
    } catch (error) {
        console.error('[Auth] Signup error:', error.message);
        return res.status(500).json({ error: 'Failed to create user.' });
    }
});

/**
 * POST /api/signin
 * Body: { identifier, password } — identifier can be username or email
 * Returns a JWT token on success.
 */
app.post('/api/signin', async (req, res) => {
    try {
        const { identifier, password } = req.body || {};

        if (!identifier || !password) {
            return res.status(400).json({ error: 'Both identifier (username or email) and password are required.' });
        }

        const user = await db.findUserByUsernameOrEmail(identifier.trim());
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const passwordValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordValid) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const tokenPayload = { id: user.id, username: user.username, email: user.email };
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        console.log(`✅ [Auth] User signed in: ${user.username} (id: ${user.id})`);
        return res.status(200).json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                email: user.email,
                created_at: user.created_at,
                updated_at: user.updated_at,
            },
        });
    } catch (error) {
        console.error('[Auth] Signin error:', error.message);
        return res.status(500).json({ error: 'Failed to sign in.' });
    }
});

/**
 * POST /api/signout
 * Requires: Authorization: Bearer <token>
 * Invalidates the current token.
 */
app.post('/api/signout', authenticateToken, (req, res) => {
    try {
        tokenBlacklist.add(req.token);
        console.log(`✅ [Auth] User signed out: ${req.user.username} (id: ${req.user.id})`);
        return res.status(200).json({ success: true, message: 'Signed out successfully.' });
    } catch (error) {
        console.error('[Auth] Signout error:', error.message);
        return res.status(500).json({ error: 'Failed to sign out.' });
    }
});

/**
 * DELETE /api/user
 * Requires: Authorization: Bearer <token>
 * Deletes the authenticated user's account.
 */
app.delete('/api/user', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const deletedUser = await db.deleteUserById(userId);
        if (!deletedUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Invalidate the token after deletion
        tokenBlacklist.add(req.token);

        console.log(`✅ [Auth] User deleted: ${deletedUser.username} (id: ${deletedUser.id})`);
        return res.status(200).json({ success: true, user: deletedUser });
    } catch (error) {
        console.error('[Auth] Delete user error:', error.message);
        return res.status(500).json({ error: 'Failed to delete user.' });
    }
});

// START — init DB schema, load CSV database, then start server
db.initDB()
    .then(() => loadAirportCacheFromDB()) // enrich airport cache from DB
    .then(() => loadAircraftCSV())
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 TimescaleDB analytics ready at /api/analytics/*`);
        });
    })
    .catch(err => {
        console.error('❌ Startup failed:', err.message);
        // If DB fails, still try to start without it
        if (err.message?.includes('ECONNREFUSED') || err.message?.includes('connect')) {
            console.warn('⚠️  DB unavailable — starting without TimescaleDB (JSON fallback active)');
            loadAircraftCSV()
                .then(() => {
                    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} (no DB)`));
                })
                .catch(csvErr => {
                    console.error('❌ Cannot start server without aircraft database:', csvErr.message);
                    process.exit(1);
                });
        } else {
            console.error('❌ Cannot start server:', err.message);
            process.exit(1);
        }
    });