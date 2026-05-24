#!/usr/bin/env node
/**
 * Downloads the OurAirports public dataset and generates
 * frontend/lib/airports-data.ts with all large + medium airports that have
 * a valid IATA code and coordinates.
 *
 * Usage:
 *   node scripts/generate-airports.js
 *
 * Requires Node 18+ (uses the built-in https module — no extra deps).
 * Re-run any time you want to refresh the dataset.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CSV_URL = 'https://ourairports.com/data/airports.csv';
const OUTPUT = path.join(__dirname, '../frontend/lib/airports-data.ts');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Aerotwin/1.0 airport-data-generator' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchUrl(res.headers.location));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function parseCsv(raw) {
    const lines = raw.split('\n');
    const headers = parseCsvLine(lines[0]);
    return lines.slice(1)
        .filter((l) => l.trim())
        .map((line) => {
            const values = parseCsvLine(line);
            const record = {};
            headers.forEach((h, i) => { record[h] = (values[i] || '').trim(); });
            return record;
        });
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    values.push(current);
    return values;
}

function escapeStr(s) {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function main() {
    console.log('Downloading OurAirports dataset from', CSV_URL, '...');
    const csv = await fetchUrl(CSV_URL);
    console.log(`Downloaded ${(csv.length / 1024).toFixed(0)} KB`);

    const records = parseCsv(csv);
    console.log(`Parsed ${records.length} total rows`);

    const airports = [];
    const seenCodes = new Set();

    for (const r of records) {
        const type = r.type || '';
        if (type !== 'large_airport' && type !== 'medium_airport') continue;

        const iata = (r.iata_code || '').trim().toUpperCase();
        if (!iata || iata.length !== 3) continue;
        if (seenCodes.has(iata)) continue;

        const lat = parseFloat(r.latitude_deg);
        const lon = parseFloat(r.longitude_deg);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const name = (r.name || iata).replace(/\s+/g, ' ').trim();
        airports.push({ code: iata, name, lat, lon });
        seenCodes.add(iata);
    }

    airports.sort((a, b) => a.code.localeCompare(b.code));
    console.log(`Found ${airports.length} large/medium airports with valid IATA codes`);

    const entries = airports
        .map((a) => `  ${a.code}: { code: "${a.code}", name: "${escapeStr(a.name)}", coords: [${a.lat}, ${a.lon}] as [number, number] }`)
        .join(',\n');

    const now = new Date().toISOString().slice(0, 10);
    const output = `// Auto-generated from OurAirports (https://ourairports.com/data/).
// Last generated: ${now} — ${airports.length} airports (large + medium with IATA codes).
// Regenerate: node scripts/generate-airports.js

export type AirportRecord = { code: string; name: string; coords: [number, number] };

const AIRPORTS_DATA: Record<string, AirportRecord> = {
${entries}
};

export default AIRPORTS_DATA;
`;

    fs.writeFileSync(OUTPUT, output, 'utf8');
    console.log(`Written ${airports.length} airports to ${OUTPUT}`);
}

main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
});
