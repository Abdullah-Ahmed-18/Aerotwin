import AIRPORTS_DATA, { type AirportRecord } from './airports-data';

export type { AirportRecord };

export function lookupAirport(iata: string): AirportRecord | null {
    return AIRPORTS_DATA[iata.toUpperCase()] ?? null;
}

/**
 * Splits a list of IATA codes into locally-resolved airports and codes that
 * were not found in the static dataset (so the caller can fall back to the API
 * for just the missing ones).
 */
export function partitionAirports(iataCodes: string[]): {
    found: Record<string, AirportRecord>;
    missing: string[];
} {
    const found: Record<string, AirportRecord> = {};
    const missing: string[] = [];
    for (const raw of iataCodes) {
        const code = raw.toUpperCase();
        const record = AIRPORTS_DATA[code];
        if (record) {
            found[code] = record;
        } else {
            missing.push(code);
        }
    }
    return { found, missing };
}

export { AIRPORTS_DATA as AIRPORTS };
