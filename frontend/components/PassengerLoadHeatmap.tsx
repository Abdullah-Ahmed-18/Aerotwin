'use client';

import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Users } from 'lucide-react';

interface Flight {
  flight_id?: string;
  route?: { source?: string; destination?: string; details?: Record<string, any> };
  aircraft?: { type?: string; capacity?: string };
  payload_stats?: { total_passengers?: string | number };
  schedule?: { arrival?: Record<string, any>; departure?: Record<string, any> };
}

interface HeatCell {
  hour: number;       // 0–23 UTC
  slot: number;       // flight index within that hour
  loadPct: number;    // 0–100
  pax: number;
  capacity: number;
  flightId: string;
  route: string;
  aircraftType: string;
}

function parseNum(raw: string | number | undefined, fallback = 0): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const m = raw.match(/\d+(\.\d+)?/);
    if (m) return parseFloat(m[0]);
  }
  return fallback;
}

function getTimestamp(flight: any): number | null {
  const candidates = [
    flight?.schedule?.arrival?.estimated,
    flight?.schedule?.arrival?.scheduled,
    flight?.schedule?.arrival?.actual,
    flight?.route?.details?.estimated_arrival,
    flight?.route?.details?.scheduled_arrival,
    flight?.schedule?.departure?.estimated,
    flight?.schedule?.departure?.scheduled,
    flight?.route?.details?.estimated_departure,
    flight?.route?.details?.scheduled_departure,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const t = Date.parse(String(c));
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function loadColor(pct: number): string {
  if (pct >= 90) return '#f43f5e';       // rose-500
  if (pct >= 80) return '#ef4444';       // red-500
  if (pct >= 70) return '#f97316';       // orange-500
  if (pct >= 60) return '#fb923c';       // orange-400
  if (pct >= 50) return '#fbbf24';       // amber-400
  return '#fde68a';                      // amber-200 (light — almost empty)
}

function loadLabel(pct: number): string {
  if (pct >= 90) return 'Critical';
  if (pct >= 80) return 'High';
  if (pct >= 70) return 'Elevated';
  if (pct >= 60) return 'Moderate';
  if (pct >= 50) return 'Normal';
  return 'Low';
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: HeatCell;
}

function CustomDot({ cx = 0, cy = 0, payload }: CustomDotProps) {
  if (!payload) return null;
  const color = loadColor(payload.loadPct);
  return (
    <rect
      x={cx - 9}
      y={cy - 9}
      width={18}
      height={18}
      rx={4}
      fill={color}
      fillOpacity={0.9}
      stroke={color}
      strokeWidth={1}
      style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
    />
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: HeatCell }>;
}

function HeatTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-900 border border-slate-600 rounded-xl px-3 py-2.5 shadow-2xl min-w-[160px]">
      <p className="text-white text-xs font-bold mb-1">{d.flightId}</p>
      <p className="text-slate-400 text-[10px] mb-1.5">{d.route}</p>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: loadColor(d.loadPct) }} />
        <span className="text-white text-xs font-bold">{d.loadPct}%</span>
        <span className="text-slate-500 text-[10px]">({loadLabel(d.loadPct)})</span>
      </div>
      <p className="text-slate-400 text-[10px]">
        {d.pax} / {d.capacity} pax · {d.aircraftType}
      </p>
      <p className="text-slate-500 text-[10px] mt-1">
        {String(d.hour).padStart(2, '0')}:00 UTC
      </p>
    </div>
  );
}

interface Props {
  flights: Flight[];
}

export default function PassengerLoadHeatmap({ flights }: Props) {
  const cells = useMemo<HeatCell[]>(() => {
    if (!Array.isArray(flights) || flights.length === 0) return [];

    const byHour: Map<number, HeatCell[]> = new Map();

    for (const f of flights) {
      const ts = getTimestamp(f);
      const hour = ts != null ? new Date(ts).getUTCHours() : -1;
      if (hour < 0) continue;

      const capacity = parseNum(f.aircraft?.capacity, 180);
      const pax      = parseNum(f.payload_stats?.total_passengers, Math.floor(capacity * 0.8));
      const safeCap  = capacity > 0 ? capacity : 180;
      const loadPct  = Math.min(100, Math.round((pax / safeCap) * 100));

      const src  = f.route?.source  || '???';
      const dest = f.route?.destination || '???';

      const cell: HeatCell = {
        hour,
        slot: 0,
        loadPct,
        pax,
        capacity: safeCap,
        flightId: (f as any).flight_id || (f as any).id || 'Unknown',
        route: `${src} → ${dest}`,
        aircraftType: f.aircraft?.type || 'Unknown',
      };

      if (!byHour.has(hour)) byHour.set(hour, []);
      byHour.get(hour)!.push(cell);
    }

    const result: HeatCell[] = [];
    byHour.forEach((hourCells, hour) => {
      hourCells.sort((a, b) => b.loadPct - a.loadPct);
      hourCells.forEach((c, idx) => {
        result.push({ ...c, hour, slot: idx });
      });
    });

    return result;
  }, [flights]);

  // Summary stats
  const avgLoad = useMemo(() => {
    if (cells.length === 0) return 0;
    return Math.round(cells.reduce((s, c) => s + c.loadPct, 0) / cells.length);
  }, [cells]);

  const peakCell = useMemo(() => {
    if (cells.length === 0) return null;
    return cells.reduce((best, c) => (c.loadPct > best.loadPct ? c : best), cells[0]);
  }, [cells]);

  const maxSlot = useMemo(() => Math.max(...cells.map(c => c.slot), 0), [cells]);

  if (cells.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-500">
        <Users size={32} className="mb-2 opacity-30" />
        <p className="text-sm">No flight data available</p>
        <p className="text-[10px] mt-1 text-slate-600">Import flights to see load heatmap</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-700/50 text-center">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">Avg Load</p>
          <p className="text-white font-bold text-sm mt-0.5"
             style={{ color: loadColor(avgLoad) }}>{avgLoad}%</p>
        </div>
        <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-700/50 text-center">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">Flights</p>
          <p className="text-white font-bold text-sm mt-0.5">{cells.length}</p>
        </div>
        <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-700/50 text-center">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">Peak</p>
          <p className="font-bold text-sm mt-0.5"
             style={{ color: peakCell ? loadColor(peakCell.loadPct) : '#fff' }}>
            {peakCell ? `${peakCell.loadPct}%` : '—'}
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5">
        {[['#fde68a', 'Low'], ['#fbbf24', '50%'], ['#f97316', '70%'], ['#ef4444', '80%'], ['#f43f5e', '90%+']].map(([color, label]) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color as string }} />
            <span className="text-slate-500 text-[9px]">{label}</span>
          </div>
        ))}
      </div>

      {/* Heatmap Chart */}
      <div className="rounded-lg overflow-hidden border border-slate-700/40">
        <ResponsiveContainer width="100%" height={180}>
          <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
            <XAxis
              dataKey="slot"
              type="number"
              domain={[0, maxSlot + 1]}
              tickCount={0}
              tick={false}
              axisLine={false}
              tickLine={false}
              label={{ value: 'Flights per hour →', position: 'insideBottom', fill: '#475569', fontSize: 9, dy: 8 }}
            />
            <YAxis
              dataKey="hour"
              type="number"
              domain={[0, 23]}
              ticks={[0, 6, 12, 18, 23]}
              tickFormatter={(v) => `${String(v).padStart(2, '0')}h`}
              tick={{ fill: '#475569', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip content={<HeatTooltip />} cursor={false} />
            <Scatter data={cells} shape={<CustomDot />}>
              {cells.map((c, i) => (
                <Cell key={i} fill={loadColor(c.loadPct)} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Peak flight callout */}
      {peakCell && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
          <div className="min-w-0">
            <p className="text-rose-300 text-[10px] font-bold truncate">
              Peak: {peakCell.flightId} ({peakCell.route})
            </p>
            <p className="text-slate-500 text-[9px]">
              {peakCell.loadPct}% load · {String(peakCell.hour).padStart(2, '0')}:00 UTC
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
