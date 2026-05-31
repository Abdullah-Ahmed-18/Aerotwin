'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Plane, Building2, Radio, Loader2 } from 'lucide-react';

const API = 'http://localhost:5000';

interface AirportResult {
  iata_code: string;
  icao_code: string;
  name: string;
  municipality: string;
  iso_country: string;
  type: string;
  latitude: number;
  longitude: number;
}

interface AircraftResult {
  icao24: string;
  registration: string;
  manufacturer: string;
  model: string;
  typecode: string;
  operator: string;
  built: string;
}

interface FlightResult {
  flight_iata: string;
  flight_icao: string;
  airline: string;
  airline_iata: string;
  flight_status: string;
  flight_type: string;
  source_iata: string;
  dest_iata: string;
  aircraft_type: string;
  estimated_pax: number;
  last_seen: string;
}

interface SearchResults {
  airports: AirportResult[];
  aircraft: AircraftResult[];
  flights:  FlightResult[];
  meta: { term: string; count: number; airports_count: number; aircraft_count: number; flights_count: number };
}

type FilterType = 'all' | 'airports' | 'aircraft' | 'flights';

const STATUS_COLORS: Record<string, string> = {
  active:    'text-emerald-400',
  scheduled: 'text-blue-400',
  landed:    'text-slate-400',
  cancelled: 'text-red-400',
  diverted:  'text-amber-400',
};

export default function SearchBar() {
  const [query, setQuery]       = useState('');
  const [filter, setFilter]     = useState<FilterType>('all');
  const [results, setResults]   = useState<SearchResults | null>(null);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef            = useRef<HTMLDivElement>(null);

  const search = useCallback(async (term: string, type: FilterType) => {
    if (term.length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/search?q=${encodeURIComponent(term)}&type=${type}&limit=8`);
      if (!res.ok) throw new Error('Search failed');
      const data: SearchResults = await res.json();
      setResults(data);
      setOpen(true);
    } catch {
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults(null); setOpen(false); return; }
    debounceRef.current = setTimeout(() => search(query, filter), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, filter, search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const clear = () => { setQuery(''); setResults(null); setOpen(false); };

  const total = results?.meta.count ?? 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl" id="global-search-bar">
      {/* Input */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-200
        ${open ? 'border-blue-500/60 bg-white shadow-lg shadow-blue-500/10' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
        {loading
          ? <Loader2 size={15} className="text-blue-400 animate-spin shrink-0" />
          : <Search size={15} className="text-slate-400 shrink-0" />
        }
        <input
          id="global-search-input"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder="Search airports, aircraft, flights…"
          className="flex-1 bg-transparent text-slate-800 text-sm placeholder-slate-500 outline-none"
          autoComplete="off"
        />
        {/* Filter pills */}
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2 ml-1">
          {(['all','airports','aircraft','flights'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all
                ${filter === f ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {query && (
          <button onClick={clear} className="p-0.5 hover:bg-slate-100 rounded-md transition-colors">
            <X size={13} className="text-slate-400" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && results && (
        <div className="absolute top-full mt-2 left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl shadow-black/10 overflow-hidden">
          {/* Meta bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
            <span className="text-slate-400 text-xs">{total === 0 ? 'No results' : `${total} result${total !== 1 ? 's' : ''} for "${results.meta.term}"`}</span>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              {results.meta.airports_count > 0 && <span>✈ {results.meta.airports_count} airports</span>}
              {results.meta.aircraft_count > 0 && <span>🛩 {results.meta.aircraft_count} aircraft</span>}
              {results.meta.flights_count > 0 && <span>📋 {results.meta.flights_count} flights</span>}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {total === 0 && (
              <div className="flex items-center justify-center py-8 text-slate-500 text-sm">No matches found</div>
            )}

            {/* Airports */}
            {results.airports.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50/50">
                  <Building2 size={11} className="text-blue-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Airports</span>
                </div>
                {results.airports.map(a => (
                  <div key={a.iata_code || a.icao_code} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-default transition-colors border-b border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                      <span className="text-blue-400 font-bold text-xs">{a.iata_code || '—'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 text-xs font-medium truncate">{a.name}</p>
                      <p className="text-slate-500 text-[10px] truncate">{a.municipality}, {a.iso_country} · {a.type?.replace('_', ' ')}</p>
                    </div>
                    <span className="text-slate-600 text-[10px] font-mono shrink-0">{a.icao_code}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Aircraft */}
            {results.aircraft.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50/50">
                  <Radio size={11} className="text-emerald-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Aircraft Registry</span>
                </div>
                {results.aircraft.map(a => (
                  <div key={a.icao24} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-default transition-colors border-b border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <span className="text-emerald-400 font-bold text-[10px]">{a.typecode || '?'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 text-xs font-medium truncate">{a.registration} · {a.manufacturer} {a.model}</p>
                      <p className="text-slate-500 text-[10px] truncate">{a.operator || 'Unknown operator'}{a.built ? ` · Built ${a.built}` : ''}</p>
                    </div>
                    <span className="text-slate-600 text-[10px] font-mono shrink-0">{a.icao24}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Flights */}
            {results.flights.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50/50">
                  <Plane size={11} className="text-purple-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Flight History</span>
                </div>
                {results.flights.map(f => (
                  <div key={f.flight_iata} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-default transition-colors border-b border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                      <Plane size={12} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-slate-800 text-xs font-medium font-mono">{f.flight_iata}</p>
                        <span className={`text-[10px] font-medium ${STATUS_COLORS[f.flight_status] ?? 'text-slate-400'}`}>{f.flight_status}</span>
                      </div>
                      <p className="text-slate-500 text-[10px] truncate">{f.airline} · {f.source_iata} → {f.dest_iata} · {f.aircraft_type}</p>
                    </div>
                    <span className="text-slate-600 text-[10px] shrink-0">{f.estimated_pax} pax</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
