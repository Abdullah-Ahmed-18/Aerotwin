const express = require("express");
const axios = require("axios");
const { spawn } = require("child_process");
const fs = require("fs");
const app = express();
const PORT = 3000;

// ==========================================
// CONFIGURATION
// ==========================================
const API_KEY = "a359142e5c2139ed3800f0f6ae381010"; // <--- PASTE KEY HERE
const TARGET_AIRPORT = "HBE";
const API_URL = "http://api.aviationstack.com/v1/flights";

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
// 1. FETCH FLIGHTS
// ==========================================
async function fetchAndSimulate() {
  console.log(`\n=== 1. FETCHING FLIGHTS FOR ${TARGET_AIRPORT} ===`);

  let allFlights = [];
  let offset = 0;
  let keepFetching = true;

  // Loop to get as many flights as possible
  while (keepFetching) {
    try {
      const response = await axios.get(API_URL, {
        params: {
          access_key: API_KEY,
          arr_iata: TARGET_AIRPORT,
          flight_status: "landed",
          limit: 100,
          offset: offset,
        },
      });

      const data = response.data.data || [];
      if (data.length === 0) break;

      const cleanBatch = data.map((f) => ({
        Flight: f.flight.iata,
        Airline: f.airline.name,
        Plane: resolvePlaneType(f.flight.iata, f.aircraft?.iata),
        Time: f.arrival.actual,
      }));

      allFlights = allFlights.concat(cleanBatch);
      if (data.length < 100) keepFetching = false;
      offset += 100;
    } catch (error) {
      console.error("API Error (Using MOCK data for safety):", error.message);
      // MOCK DATA BACKUP if API fails
      allFlights = [
        {
          Flight: "MS999",
          Airline: "EgyptAir",
          Plane: "B738",
          Time: new Date().toISOString(),
        },
        {
          Flight: "FZ123",
          Airline: "FlyDubai",
          Plane: "B38M",
          Time: new Date().toISOString(),
        },
      ];
      keepFetching = false;
    }
  }

  console.log(`[+] Retrieved ${allFlights.length} flights.`);
  console.log(`=== 2. STARTING PYTHON MONTE CARLO SIMULATION ===`);

  runPythonSimulation(allFlights);
}

// ==========================================
// 2. RUN PYTHON
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
  fetchAndSimulate();
});
