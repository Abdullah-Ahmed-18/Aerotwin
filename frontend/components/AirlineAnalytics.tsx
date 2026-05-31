'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BarChart2, Plane, TrendingUp, Award, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AirlineStat {
  iata: string;
  name: string;
  flights: number;
  totalPax: number;
  avgLoad: number;           // 0–100
  statusCounts: Record<string, number>;
  types: Record<string, number>;   // aircraft type → count
  routes: Set<string>;
  color: string;
}

// ─── Palette  (cycles for unknown airlines) ───────────────────────────────────
const PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#f43f5e',
  '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
];

const STATUS_COLORS: Record<string, string> = {
  active:    '#10b981',
  scheduled: '#3b82f6',
  landed:    '#64748b',
  diverted:  '#f59e0b',
  cancelled: '#ef4444',
  incident:  '#f97316',
  unknown:   '#475569',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseNum(raw: string | number | undefined, fallback = 0): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const m = raw.match(/\d+(\.\d+)?/);
    if (m) return parseFloat(m[0]);
  }
  return fallback;
}

// ─── Custom tooltip for bar chart ─────────────────────────────────────────────
function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-slate-800 text-xs font-bold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-[10px]" style={{ color: p.fill }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  flights: any[];
}

type SortKey = 'flights' | 'pax' | 'load';

export default function AirlineAnalytics({ flights }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('flights');
  const [expandedIata, setExpandedIata] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<'flights' | 'pax'>('flights');

  const airlines = useMemo<AirlineStat[]>(() => {
    if (!Array.isArray(flights) || flights.length === 0) return [];

    const map = new Map<string, AirlineStat>();

    flights.forEach((f, idx) => {
      const iata  = (f?.airline_iata || 'XX').toUpperCase();
      const name  = f?.airline || f?.airline_iata || 'Unknown';
      const cap   = parseNum(f?.aircraft?.capacity, 180);
      const pax   = Math.min(parseNum(f?.payload_stats?.total_passengers, Math.floor(cap * 0.8)), cap);
      const load  = cap > 0 ? Math.round((pax / cap) * 100) : 0;
      const status = (f?.flight_status || 'unknown').toLowerCase();
      const type   = f?.aircraft?.type || 'Unknown';
      const src    = f?.route?.source || '???';
      const dst    = f?.route?.destination || '???';
      const route  = `${src}→${dst}`;

      if (!map.has(iata)) {
        map.set(iata, {
          iata,
          name: name.replace(' (Simulated)', '').replace(' Airlines', '').trim(),
          flights: 0,
          totalPax: 0,
          avgLoad: 0,
          statusCounts: {},
          types: {},
          routes: new Set(),
          color: PALETTE[map.size % PALETTE.length],
        });
      }

      const a = map.get(iata)!;
      a.flights++;
      a.totalPax += pax;
      a.statusCounts[status] = (a.statusCounts[status] || 0) + 1;
      a.types[type] = (a.types[type] || 0) + 1;
      a.routes.add(route);
    });

    // Compute avgLoad
    const result = Array.from(map.values()).map(a => ({
      ...a,
      avgLoad: a.flights > 0 ? Math.round(a.totalPax / a.flights / 1.8) : 0,
    }));

    // Sort
    result.sort((a, b) => {
      if (sortKey === 'pax')  return b.totalPax - a.totalPax;
      if (sortKey === 'load') return b.avgLoad  - a.avgLoad;
      return b.flights - a.flights;
    });

    return result;
  }, [flights, sortKey]);

  const totalFlights = airlines.reduce((s, a) => s + a.flights, 0);
  const totalPax     = airlines.reduce((s, a) => s + a.totalPax, 0);
  const topAirline   = airlines[0] ?? null;

  const chartData = airlines.slice(0, 8).map(a => ({
    name: a.iata,
    [chartMetric === 'flights' ? 'Flights' : 'Pax']:
      chartMetric === 'flights' ? a.flights : a.totalPax,
    color: a.color,
  }));

  if (!Array.isArray(flights) || flights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-500">
        <BarChart2 size={32} className="mb-2 opacity-30" />
        <p className="text-sm">No flight data available</p>
        <p className="text-[10px] mt-1 text-slate-600">Import flights to see airline analytics</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">Airlines</p>
          <p className="text-slate-800 font-bold text-sm mt-0.5">{airlines.length}</p>
        </div>
        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">Flights</p>
          <p className="text-slate-800 font-bold text-sm mt-0.5">{totalFlights}</p>
        </div>
        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">Total Pax</p>
          <p className="text-indigo-600 font-bold text-sm mt-0.5">{totalPax.toLocaleString()}</p>
        </div>
      </div>

      {/* Top airline badge */}
      {topAirline && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
          <Award size={12} className="text-indigo-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-indigo-600 text-[10px] font-bold truncate">
              Top Carrier: {topAirline.name} ({topAirline.iata})
            </p>
            <p className="text-slate-500 text-[9px]">
              {topAirline.flights} flights · {topAirline.totalPax.toLocaleString()} pax ·{' '}
              {Math.round((topAirline.flights / totalFlights) * 100)}% market share
            </p>
          </div>
        </div>
      )}

      {/* Chart metric toggle + chart */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">
            {chartMetric === 'flights' ? 'Flights per Airline' : 'Passengers per Airline'}
          </p>
          <div className="flex gap-1">
            {(['flights', 'pax'] as const).map(m => (
              <button
                key={m}
                onClick={() => setChartMetric(m)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all ${
                  chartMetric === m
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                {m === 'flights' ? '✈ Flights' : '👤 Pax'}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg overflow-hidden border border-slate-200 bg-white/40">
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 2, left: -16 }} barCategoryGap="30%">
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey={chartMetric === 'flights' ? 'Flights' : 'Pax'} radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <span className="text-slate-500 text-[9px] uppercase tracking-wider shrink-0">Sort:</span>
        <div className="flex gap-1">
          {(['flights', 'pax', 'load'] as SortKey[]).map(k => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide transition-all ${
                sortKey === k
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {k === 'flights' ? 'Flights' : k === 'pax' ? 'Pax' : 'Load'}
            </button>
          ))}
        </div>
      </div>

      {/* Airline rows */}
      <div className="space-y-1.5">
        {airlines.map((a) => {
          const share   = totalFlights > 0 ? Math.round((a.flights / totalFlights) * 100) : 0;
          const isExp   = expandedIata === a.iata;
          const dominant = Object.entries(a.statusCounts).sort((x, y) => y[1] - x[1])[0];
          const topType  = Object.entries(a.types).sort((x, y) => y[1] - x[1])[0];

          return (
            <div
              key={a.iata}
              className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden"
            >
              {/* Row header */}
              <button
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left"
                onClick={() => setExpandedIata(isExp ? null : a.iata)}
              >
                {/* Colour swatch */}
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: a.color }} />

                {/* Airline name + share bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-slate-700 text-[10px] font-bold truncate">{a.iata} · {a.name}</p>
                    <p className="text-slate-400 text-[9px] shrink-0 ml-1">{a.flights} flt</p>
                  </div>
                  <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${share}%`, backgroundColor: a.color }}
                    />
                  </div>
                </div>

                {/* Share label */}
                <span className="text-[9px] text-slate-500 shrink-0">{share}%</span>
                {isExp
                  ? <ChevronUp size={10} className="text-slate-500 shrink-0" />
                  : <ChevronDown size={10} className="text-slate-500 shrink-0" />
                }
              </button>

              {/* Expanded detail */}
              {isExp && (
                <div className="px-2.5 pb-2.5 pt-0 border-t border-slate-100 space-y-2">
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    <div className="bg-slate-50 rounded-md p-1.5">
                      <p className="text-slate-500 text-[8px] uppercase">Total Pax</p>
                      <p className="text-slate-800 text-xs font-bold">{a.totalPax.toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-50 rounded-md p-1.5">
                      <p className="text-slate-500 text-[8px] uppercase">Pax / Flight</p>
                      <p className="text-slate-800 text-xs font-bold">
                        {a.flights > 0 ? Math.round(a.totalPax / a.flights) : '—'}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-md p-1.5">
                      <p className="text-slate-500 text-[8px] uppercase">Top Status</p>
                      <p className="text-xs font-bold" style={{ color: STATUS_COLORS[dominant?.[0]] || '#1e293b' }}>
                        {dominant ? `${dominant[0]} (${dominant[1]})` : '—'}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-md p-1.5">
                      <p className="text-slate-500 text-[8px] uppercase">Fleet Type</p>
                      <p className="text-slate-800 text-xs font-bold">{topType?.[0] || '—'}</p>
                    </div>
                  </div>

                  {/* Status mini-bars */}
                  <div className="space-y-1">
                    <p className="text-slate-500 text-[8px] uppercase tracking-wider">Status Breakdown</p>
                    {Object.entries(a.statusCounts)
                      .sort((x, y) => y[1] - x[1])
                      .map(([status, count]) => {
                        const pct = a.flights > 0 ? Math.round((count / a.flights) * 100) : 0;
                        return (
                          <div key={status} className="flex items-center gap-2">
                            <span className="text-[8px] text-slate-400 w-14 capitalize truncate">{status}</span>
                            <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[status] || '#475569' }}
                              />
                            </div>
                            <span className="text-[8px] text-slate-500 w-6 text-right">{count}</span>
                          </div>
                        );
                      })}
                  </div>

                  {/* Routes */}
                  <div>
                    <p className="text-slate-500 text-[8px] uppercase tracking-wider mb-1">
                      Routes ({a.routes.size})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(a.routes).slice(0, 6).map(r => (
                        <span
                          key={r}
                          className="px-1.5 py-0.5 bg-slate-100 rounded text-[8px] text-slate-600 font-mono"
                        >
                          {r}
                        </span>
                      ))}
                      {a.routes.size > 6 && (
                        <span className="px-1.5 py-0.5 text-[8px] text-slate-500">
                          +{a.routes.size - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
