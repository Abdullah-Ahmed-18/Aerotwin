const express = require("express");
const axios = require("axios");
const { spawn } = require("child_process");
const fs = require("fs");
const cors = require("cors");
const app = express();
const PORT = 5000;

// ==========================================
// CONFIGURATION
// ==========================================
const API_KEY = "a359142e5c2139ed3800f0f6ae381010"; // <--- PASTE KEY HERE
const TARGET_AIRPORT = "HBE";
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
        const airportCode = req.query.airport || TARGET_AIRPORT;
        const flightStatus = req.query.status || 'active';
        
        const params = { access_key: API_KEY, arr_iata: airportCode };
        
        // Only add flight_status filter if it's not 'all'
        if (flightStatus !== 'all') {
            params.flight_status = flightStatus;
        }
        
        const response = await axios.get(API_URL, { params });

        const rawFlights = response.data.data || [];

        const formattedFlights = rawFlights.map(f => {
            const aircraftRaw = f.aircraft?.iata;
            const aircraftCode = resolvePlaneType(f.flight.iata, aircraftRaw);
            
            // Extract clean code for capacity lookup even if it says "(Dummy)"
            const lookupCode = aircraftCode.split(' ')[0];
            const maxCapacity = AIRCRAFT_CAPACITIES[lookupCode] || 180;
            
            const loadFactor = (Math.random() * (0.20) + 0.75);
            const estimatedPax = Math.floor(maxCapacity * loadFactor);

            const sourceCode = f.departure?.iata || "UNK";
            const isDomestic = DOMESTIC_EGYPT_AIRPORTS.includes(sourceCode);

            // --- OPERATIONAL LOGIC WITH DUMMY LABELS ---
            const terminal = (f.airline.name.includes("EgyptAir")) ? "T1" : "T2";
            
            // Check if Gate/Belt exists in API, otherwise generate and label as Dummy
            const gate = f.arrival?.gate ? f.arrival.gate : `${terminal}-G${Math.floor(Math.random() * 12) + 1} (Dummy)`;
            const belt = f.arrival?.baggage ? f.arrival.baggage : `B${Math.floor(Math.random() * 4) + 1} (Dummy)`;

            return {
                flight_id: f.flight.iata || f.flight.icao,
                airline: f.airline.name,
                flight_status: f.flight_status || "unknown",
                flight_type: isDomestic ? "Domestic" : "International",
                
                route: {
                    source: sourceCode,
                    destination: airportCode,
                    details: {
                        origin_name: f.departure?.airport || "Unknown Departure",
                        terminal: terminal,
                        gate_id: gate
                    }
                },
                
                aircraft: { 
                    type: aircraftCode, 
                    capacity: `${maxCapacity} (Simulated)` 
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
        });

        const finalPayload = {
            meta: { updated: new Date().toISOString(), airport: airportCode, count: formattedFlights.length },
            flights: formattedFlights
        };

        fs.writeFileSync("active_flights.json", JSON.stringify(finalPayload, null, 2));
        res.status(200).json(finalPayload);

    } catch (error) {
        console.error("Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch active flights." });
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
// START
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});