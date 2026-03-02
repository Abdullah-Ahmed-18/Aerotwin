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
                // Feature_Val 1 or long service time = full security screening (Security_2)
                // Feature_Val 0 and short service time = simple security (Security_1)
                const isFullScreening = featureVal === 1 || (avgServiceTime && avgServiceTime > 150);
                
                // Find Security_1 or Security_2 based on screening type
                const targetCheckpoint = isFullScreening ? 
                    checkpoints.find(cp => cp.Checkpoint_ID === "Security_2") :
                    checkpoints.find(cp => cp.Checkpoint_ID === "Security_1");
                
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

// Helper to fill missing plane types
function resolvePlaneType(flightIata, apiPlane) {
  if (apiPlane) return apiPlane;
  if (!flightIata) return "A320";
  const airline = flightIata.substring(0, 2).toUpperCase();
  const fleet = fleetDatabase[airline];
  return fleet ? fleet[Math.floor(Math.random() * fleet.length)] : "A320";
}

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
        
        // Step 0: Create mapping from frontend checkpoint IDs to their Checkpoint_ID (idCode)
        const frontendIdToCheckpointId = {};
        incomingData.forEach(checkpoint => {
            frontendIdToCheckpointId[checkpoint.id] = checkpoint.idCode;
        });

        console.log("Frontend ID to Checkpoint ID mapping:", frontendIdToCheckpointId);
        
        // Step 1: Pass the deeply nested payload through the recursive formatter
        let finalPayload = mapKeysDeep(incomingData, keyMapping);

        // Ensure finalPayload is an array of checkpoints
        if (!Array.isArray(finalPayload)) {
            finalPayload = [];
        }

        // Step 2: Build a mapping of checkpoint ID to next checkpoint ID for quick lookup
        const checkpointNextMap = {};
        incomingData.forEach((checkpoint) => {
            if (checkpoint.nextCheckpointIds && Array.isArray(checkpoint.nextCheckpointIds) && checkpoint.nextCheckpointIds.length > 0) {
                const frontendNextId = checkpoint.nextCheckpointIds[0];
                // Convert frontend ID to actual Checkpoint_ID
                const nextCheckpointId = frontendIdToCheckpointId[frontendNextId];
                if (nextCheckpointId) {
                    checkpointNextMap[checkpoint.idCode] = nextCheckpointId;
                }
            }
        });

        console.log("Checkpoint next mapping:", checkpointNextMap);

        // Step 3: Build reverse mapping for previous anchors (computed from next anchors)
        const previousAnchorMap = {};
        Object.entries(checkpointNextMap).forEach(([currentId, nextId]) => {
            previousAnchorMap[nextId] = currentId;
        });

        console.log("Previous anchor mapping (computed):", previousAnchorMap);

        // Step 4: Update all checkpoints with proper structure, Prev_Anchor, and Next_Anchor
        finalPayload = finalPayload.map((checkpoint, index) => {
            const checkpointId = checkpoint.Checkpoint_ID;
            
            // Set Prev_Anchor: use computed mapping or "Terminal_Entrance" for first checkpoint
            if (previousAnchorMap[checkpointId]) {
                checkpoint.Prev_Anchor = previousAnchorMap[checkpointId];
            } else if (index === 0) {
                checkpoint.Prev_Anchor = "Terminal_Entrance";
            } else {
                // If no previous anchor mapping and not first checkpoint, use the previous checkpoint in the array
                checkpoint.Prev_Anchor = finalPayload[index - 1].Checkpoint_ID;
            }
            
            // Set Next_Anchor from the mapping or sequential order
            if (checkpointNextMap[checkpointId]) {
                // Use explicit mapping from frontend
                checkpoint.Next_Anchor = [checkpointNextMap[checkpointId]];
            } else if (index < finalPayload.length - 1) {
                // Not the last checkpoint and no explicit mapping - use next in sequence
                checkpoint.Next_Anchor = [finalPayload[index + 1].Checkpoint_ID];
            } else {
                // Last checkpoint - set to Boarding_Gate
                checkpoint.Next_Anchor = ["Boarding_Gate"];
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

// // ==========================================
// // 2. FETCH FLIGHTS
// // ==========================================
// async function fetchAndSimulate() {
//   console.log(`\n=== 1. FETCHING FLIGHTS FOR ${TARGET_AIRPORT} ===`);

//   let allFlights = [];
//   let offset = 0;
//   let keepFetching = true;

//   // Loop to get as many flights as possible
//   while (keepFetching) {
//     try {
//       const response = await axios.get(API_URL, {
//         params: {
//           access_key: API_KEY,
//           arr_iata: TARGET_AIRPORT,
//           flight_status: "landed",
//           limit: 100,
//           offset: offset,
//         },
//       });

//       const data = response.data.data || [];
//       if (data.length === 0) break;

//       const cleanBatch = data.map((f) => ({
//         Flight: f.flight.iata,
//         Airline: f.airline.name,
//         Plane: resolvePlaneType(f.flight.iata, f.aircraft?.iata),
//         Time: f.arrival.actual,
//       }));

//       allFlights = allFlights.concat(cleanBatch);
//       if (data.length < 100) keepFetching = false;
//       offset += 100;
//     } catch (error) {
//       console.error("API Error (Using MOCK data for safety):", error.message);
//       // MOCK DATA BACKUP if API fails
//       allFlights = [
//         {
//           Flight: "MS999",
//           Airline: "EgyptAir",
//           Plane: "B738",
//           Time: new Date().toISOString(),
//         },
//         {
//           Flight: "FZ123",
//           Airline: "FlyDubai",
//           Plane: "B38M",
//           Time: new Date().toISOString(),
//         },
//       ];
//       keepFetching = false;
//     }
//   }

//   console.log(`[+] Retrieved ${allFlights.length} flights.`);
//   console.log(`=== 2. STARTING PYTHON MONTE CARLO SIMULATION ===`);

//   runPythonSimulation(allFlights);
// }

// ==========================================
// 3. RUN PYTHON
// ==========================================
function runPythonSimulation(flightList) {
  // Convert flight list to JSON string to pass to Python
  const flightsJson = JSON.stringify(flightList);

  const python = spawn("python", ["passenger_generator.py", flightsJson]);

  let csvData = "";

  python.stdout.on("data", (data) => {
    csvData += data.toString();
  });

  python.stderr.on("data", (data) => {
    console.error(`Python Error: ${data}`);
  });

  python.on("close", (code) => {
    if (code === 0) {
      // SAVE CSV TO FILE
      fs.writeFileSync("simulation_data.csv", csvData);
      console.log(`\n✅ SUCCESS! Simulation complete.`);
      console.log(`📄 Data saved to: simulation_data.csv`);
      console.log(`📊 Total Rows generated: ${csvData.split("\n").length - 1}`);
    } else {
      console.log(`Python process exited with code ${code}`);
    }
  });
}

// START
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
  //fetchAndSimulate();
});