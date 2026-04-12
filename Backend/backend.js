require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// CONFIGURATION
// ==========================================
const API_KEY = process.env.AVIATIONSTACK_API_KEY;
const TARGET_AIRPORT = process.env.TARGET_AIRPORT || "HBE";
const API_URL = "http://api.aviationstack.com/v1/flights";
const AIRPORTS_URL = "http://api.aviationstack.com/v1/airports";
const DOMESTIC_EGYPT_AIRPORTS = ["CAI", "SSH", "HRG", "LXR", "ASW", "HBE", "ALY", "TCP", "RMF"];
const AIRCRAFT_CAPACITIES = { "B738": 189, "A320": 180, "A220": 135, "B38M": 189, "A321": 220, "A333": 300, "A21N": 240, "AT72": 72 };
const AIRPORT_COORDINATES = {
    HBE: { code: "HBE", name: "Borg El Arab Airport", coords: [30.9177, 29.6964] },
    CAI: { code: "CAI", name: "Cairo International Airport", coords: [30.1219, 31.4056] },
    DXB: { code: "DXB", name: "Dubai International Airport", coords: [25.2532, 55.3657] },
    JFK: { code: "JFK", name: "John F. Kennedy International Airport", coords: [40.6413, -73.7781] },
    LHR: { code: "LHR", name: "London Heathrow Airport", coords: [51.47, -0.4543] },
    IST: { code: "IST", name: "Istanbul Airport", coords: [41.2753, 28.7519] },
    AUH: { code: "AUH", name: "Abu Dhabi International Airport", coords: [24.433, 54.6511] },
    MED: { code: "MED", name: "Prince Mohammad Bin Abdulaziz Airport", coords: [24.5534, 39.7051] }
};

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
        const incomingData = req.body;
        
        console.log("\n=== INCOMING DATA DEBUG ===");
        console.log("Number of checkpoints:", incomingData.length);
        incomingData.forEach(cp => {
            console.log(`  ${cp.idCode}: nextCheckpointIds =`, cp.nextCheckpointIds);
        });
        
        // Step 0: Create mapping from frontend checkpoint IDs to their Checkpoint_ID (idCode)
        const frontendIdToCheckpointId = {};
        incomingData.forEach(checkpoint => {
            frontendIdToCheckpointId[checkpoint.id] = checkpoint.idCode;
        });

        console.log("\nFrontend ID to Checkpoint ID mapping:", frontendIdToCheckpointId);
        
        // Step 1: Pass the deeply nested payload through the recursive formatter
        let finalPayload = mapKeysDeep(incomingData, keyMapping);

        // Ensure finalPayload is an array of checkpoints
        if (!Array.isArray(finalPayload)) {
            finalPayload = [];
        }

        // Step 2: Build a mapping of checkpoint ID to next checkpoint IDs (array for forks)
        const checkpointNextMap = {};
        incomingData.forEach((checkpoint) => {
            if (checkpoint.nextCheckpointIds && Array.isArray(checkpoint.nextCheckpointIds) && checkpoint.nextCheckpointIds.length > 0) {
                // Convert ALL frontend IDs to actual Checkpoint_IDs (handle forks)
                const nextCheckpointIds = checkpoint.nextCheckpointIds
                    .map(frontendNextId => {
                        const mapped = frontendIdToCheckpointId[frontendNextId];
                        console.log(`  Mapping frontend ID "${frontendNextId}" → "${mapped}"`);
                        return mapped;
                    })
                    .filter(id => id); // Remove undefined values
                
                console.log(`  ${checkpoint.idCode} will have Next_Anchor:`, nextCheckpointIds);
                
                if (nextCheckpointIds.length > 0) {
                    checkpointNextMap[checkpoint.idCode] = nextCheckpointIds;
                }
            }
        });

        console.log("\nFinal Checkpoint next mapping:", JSON.stringify(checkpointNextMap, null, 2));

        // Check if we have explicit connections or need to use sequential fallback
        const hasExplicitConnections = Object.keys(checkpointNextMap).length > 0;
        console.log("Has explicit connections:", hasExplicitConnections);

        // Step 3: Build reverse mapping for previous anchors (computed from next anchors)
        const previousAnchorMap = {};
        
        if (hasExplicitConnections) {
            // Use explicit connections from frontend
            Object.entries(checkpointNextMap).forEach(([currentId, nextIds]) => {
                // nextIds is now an array, so iterate through all of them
                nextIds.forEach(nextId => {
                    previousAnchorMap[nextId] = currentId;
                });
            });
        } else {
            // Fallback: Use sequential order
            console.log("No explicit connections found, using sequential order");
            for (let i = 1; i < finalPayload.length; i++) {
                previousAnchorMap[finalPayload[i].Checkpoint_ID] = finalPayload[i - 1].Checkpoint_ID;
            }
        }

        console.log("Previous anchor mapping (computed):", previousAnchorMap);

        // Step 4: Identify terminal checkpoints (those that aren't referenced as next by any other checkpoint)
        const referencedCheckpoints = new Set();
        Object.values(checkpointNextMap).forEach(nextIds => {
            nextIds.forEach(id => referencedCheckpoints.add(id));
        });
        
        const terminalCheckpoints = finalPayload
            .map(cp => cp.Checkpoint_ID)
            .filter(id => !referencedCheckpoints.has(id) && id !== finalPayload[0]?.Checkpoint_ID);

        console.log("Terminal checkpoints (will point to Boarding_Gate):", terminalCheckpoints);

        // Step 5: Update all checkpoints with proper structure, Prev_Anchor, and Next_Anchor
        finalPayload = finalPayload.map((checkpoint, index) => {
            const checkpointId = checkpoint.Checkpoint_ID;
            
            console.log(`\nProcessing checkpoint: ${checkpointId} (index: ${index})`);
            
            // Set Prev_Anchor: use computed mapping or "Terminal_Entrance" for first checkpoint
            if (index === 0) {
                checkpoint.Prev_Anchor = "Terminal_Entrance";
                console.log(`  → Prev_Anchor: "Terminal_Entrance" (first checkpoint)`);
            } else if (previousAnchorMap[checkpointId]) {
                checkpoint.Prev_Anchor = previousAnchorMap[checkpointId];
                console.log(`  → Prev_Anchor: "${previousAnchorMap[checkpointId]}" (from mapping)`);
            } else {
                // Fallback for disconnected checkpoints
                checkpoint.Prev_Anchor = "Terminal_Entrance";
                console.log(`  → Prev_Anchor: "Terminal_Entrance" (fallback)`);
            }
            
            // Set Next_Anchor from the explicit mapping or fallback to sequential
            if (hasExplicitConnections && checkpointNextMap[checkpointId]) {
                // Use explicit mapping from frontend (already an array for forks)
                checkpoint.Next_Anchor = checkpointNextMap[checkpointId];
                console.log(`  → Next_Anchor:`, checkpoint.Next_Anchor, "(from explicit mapping)");
            } else if (hasExplicitConnections && terminalCheckpoints.includes(checkpointId)) {
                // Terminal checkpoint - points to Boarding_Gate
                checkpoint.Next_Anchor = ["Boarding_Gate"];
                console.log(`  → Next_Anchor: ["Boarding_Gate"] (terminal checkpoint)`);
            } else if (!hasExplicitConnections) {
                // Fallback to sequential order
                if (index < finalPayload.length - 1) {
                    checkpoint.Next_Anchor = [finalPayload[index + 1].Checkpoint_ID];
                    console.log(`  → Next_Anchor: [${finalPayload[index + 1].Checkpoint_ID}] (sequential)`);
                } else {
                    checkpoint.Next_Anchor = ["Boarding_Gate"];
                    console.log(`  → Next_Anchor: ["Boarding_Gate"] (last in sequence)`);
                }
            } else {
                // No explicit next connection and not a terminal - default
                checkpoint.Next_Anchor = ["Boarding_Gate"];
                console.log(`  → Next_Anchor: ["Boarding_Gate"] (default)`);
            }
            
            // Fix Stations: remove Checkpoint_ID and rename Station_Name to Station_ID
            const stations = (checkpoint.Stations || []).map(station => {
                const { Checkpoint_ID, Station_Name, ...rest } = station;
                
                // Get appropriate tasks based on checkpoint type and feature value
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
            
            // Reorder: Checkpoint_ID, Checkpoint_Type, Prev_Anchor, Next_Anchor, then Stations
            const ordered = {};
            ordered.Checkpoint_ID = checkpoint.Checkpoint_ID;
            ordered.Checkpoint_Type = checkpoint.Checkpoint_Type;
            if (checkpoint.Prev_Anchor) ordered.Prev_Anchor = checkpoint.Prev_Anchor;
            if (checkpoint.Next_Anchor) ordered.Next_Anchor = checkpoint.Next_Anchor;
            ordered.Stations = stations;
            
            return ordered;
        });

        console.log("✅ Successfully formatted deeply nested payload from frontend");
        console.log("📊 Checkpoints processed:", finalPayload.length);
        console.log("📤 Formatted output:", JSON.stringify(finalPayload, null, 2));

        // Wrap in Checkpoints object
        const formattedResponse = {
            Checkpoints: finalPayload
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

app.get('/api/fetch-active-flights', async (req, res) => {
    try {
        const requestedAirport = String(req.query.airport || TARGET_AIRPORT).trim().toUpperCase();
        const flightStatus = req.query.status || 'active';

        const requestedIata = normalizeIata(requestedAirport, "");
        const requestedIcao = normalizeIcao(requestedAirport, "");
        const airportIata = requestedIata || TARGET_AIRPORT;
        const airportIcao = requestedIcao || "UNK";

        const params = { access_key: API_KEY };

        if (requestedIcao) {
            params.arr_icao = requestedIcao;
        } else {
            params.arr_iata = airportIata;
        }
        
        if (flightStatus !== 'all') {
            params.flight_status = flightStatus;
        }
        
        // Fetch AviationStack + ALL OpenSky sources in parallel
        const airportCoords = AIRPORT_COORDINATES[airportIata];
        const [aviationStackRes, openskyStates, openskyArrivals, openskyRecentFlights] = await Promise.all([
            axios.get(API_URL, { params }),
            airportCoords
                ? fetchOpenSkyLiveNearAirport(airportIata, airportCoords)
                : Promise.resolve([]),
            fetchOpenSkyArrivals(airportIata, 48).catch(() => []),
            fetchOpenSkyRecentFlights().catch(() => []),
        ]);

        const rawFlights = aviationStackRes.data.data || [];

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
            const destinationIata = normalizeIata(f.arrival?.iata, airportIata);
            const destinationIcao = normalizeIcao(f.arrival?.icao, airportIcao);
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
                        gate_id: gate
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
                }
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

        // Save enriched data to disk
        fs.writeFileSync('active_flights.json', JSON.stringify(finalPayload, null, 2));
        console.log(`💾 Saved ${formattedFlights.length} enriched flights to active_flights.json`);

        res.status(200).json(finalPayload);

    } catch (error) {
        console.error("Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch active flights." });
    }
});

app.post('/api/save-active-flights', (req, res) => {
    try {
        const airport = String(req.body?.airport || TARGET_AIRPORT).trim().toUpperCase();
        const incomingFlights = Array.isArray(req.body?.flights) ? req.body.flights : [];

        if (incomingFlights.length === 0) {
            return res.status(400).json({ error: 'No flights provided for export.' });
        }

        const airportIata = normalizeIata(airport, TARGET_AIRPORT);
        const airportIcao = normalizeIcao(airport, "UNK");

        const payload = {
            meta: {
                updated: new Date().toISOString(),
                airport: airportIata,
                airport_icao: airportIcao,
                count: incomingFlights.length,
                source: "frontend-export"
            },
            flights: incomingFlights
        };

        fs.writeFileSync("active_flights.json", JSON.stringify(payload, null, 2));
        return res.status(200).json({ success: true, path: "active_flights.json", count: incomingFlights.length });
    } catch (error) {
        console.error("Save active flights error:", error.message);
        return res.status(500).json({ error: 'Failed to save active flights JSON.' });
    }
});

app.get('/api/airport-location', async (req, res) => {
    try {
        const airportCode = String(req.query.airport || TARGET_AIRPORT).trim().toUpperCase();

        if (!airportCode) {
            return res.status(400).json({ error: 'Airport code is required.' });
        }

        const fallbackAirport = AIRPORT_COORDINATES[airportCode];
        if (fallbackAirport) {
            return res.status(200).json(fallbackAirport);
        }

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
            return res.status(404).json({ error: `No coordinates found for ${airportCode}.` });
        }

        return res.status(200).json({
            code: airportCode,
            name: airport?.airport_name || airport?.airport || airportCode,
            coords: [latitude, longitude]
        });
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

// START — load CSV database first, then start server
loadAircraftCSV()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on ${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ Cannot start server without aircraft database:', err.message);
        process.exit(1);
    });