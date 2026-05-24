'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, RefreshCw, AlertCircle } from 'lucide-react';

const API = 'http://localhost:5000';

interface TrendBucket {
  bucket: string;
  flight_status: string;
  count: number;
}

interface GroupedBucket {
  hour: string;          // display label  e.g. "14:00"
  active: number;
  scheduled: number;
  landed: number;
  cancelled: number;
  diverted: number;
  unknown: number;
  total: number;
}

const STATUS_COLOR: Record<string, string> = {
  active:    '#10b981',
  scheduled: '#3b82f6',
  landed:    '#64748b',
  cancelled: '#ef4444',
  diverted:  '#f59e0b',
  unknown:   '#6b7280',
};

interface Props {
  airport?: string;
  hours?: number;
}

export default function FlightTrendChart({ airport = 'HBE', hours = 12 }: Props) {
  const [data,    setData]    = useState<GroupedBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [hovered, setHovered] = useState<GroupedBucket | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/analytics/status-trend?airport=${airport}&hours=${hours}`);
      if (!res.ok) throw new Error('Failed to fetch trend data');
      const json = await res.json();
      const raw: TrendBucket[] = json.trend ?? [];

      // Group by hour bucket
      const map = new Map<string, GroupedBucket>();
      for (const row of raw) {
        const key = row.bucket;
        if (!map.has(key)) {
          const d = new Date(row.bucket);
          map.set(key, {
            hour: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            active: 0, scheduled: 0, landed: 0,
            cancelled: 0, diverted: 0, unknown: 0, total: 0,
          });
        }
        const g = map.get(key)!;
        const s = row.flight_status as keyof GroupedBucket;
        if (typeof g[s] === 'number') (g[s] as number) += row.count;
        else g.unknown += row.count;
        g.total += row.count;
      }

      setData(Array.from(map.values()));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [airport, hours]);

  useEffect(() => { load(); }, [load]);

  const maxTotal = Math.max(...data.map(d => d.total), 1);

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <RefreshCw size={22} className="text-slate-500 animate-spin" />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500">
      <AlertCircle size={24} className="text-red-400/60" />
      <p className="text-xs">{error}</p>
    </div>
  );

  if (data.length === 0) return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500">
      <TrendingUp size={28} className="opacity-30" />
      <p className="text-xs">No trend data yet — fetch flights to populate</p>
    </div>
  );

  const statuses: Array<keyof GroupedBucket> = ['active', 'scheduled', 'landed', 'cancelled', 'diverted', 'unknown'];

  return (
    <div className="space-y-3" id="flight-trend-chart">
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {statuses.map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLOR[s as string] }} />
            <span className="text-slate-400 text-[10px] capitalize">{s}</span>
          </div>
        ))}
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="flex flex-wrap gap-3 p-2.5 bg-slate-800/70 rounded-lg border border-slate-700/50">
          <span className="text-slate-300 text-xs font-mono w-full">{hovered.hour}</span>
          {statuses.filter(s => (hovered[s] as number) > 0).map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm" style={{ background: STATUS_COLOR[s as string] }} />
              <span className="text-slate-300 text-[10px] capitalize">{s}: <strong>{hovered[s] as number}</strong></span>
            </div>
          ))}
          <span className="text-slate-400 text-[10px] ml-auto">Total: {hovered.total}</span>
        </div>
      )}

      {/* Stacked bar chart */}
      <div className="flex items-end gap-1 h-32">
        {data.map((bucket, i) => (
          <div
            key={i}
            className="flex-1 flex flex-col justify-end gap-px cursor-pointer group"
            onMouseEnter={() => setHovered(bucket)}
            onMouseLeave={() => setHovered(null)}
          >
            {statuses.map(s => {
              const val = bucket[s] as number;
              if (val === 0) return null;
              const pct = (val / maxTotal) * 100;
              return (
                <div
                  key={s}
                  className="w-full rounded-sm transition-all group-hover:opacity-80"
                  style={{ height: `${pct}%`, background: STATUS_COLOR[s as string], minHeight: val > 0 ? 2 : 0 }}
                />
              );
            })}
            {/* X-axis label */}
            <span className="text-[8px] text-slate-600 text-center mt-1 truncate">{bucket.hour}</span>
          </div>
        ))}
      </div>

      {/* Refresh */}
      <button
        onClick={load}
        className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        id="flight-trend-refresh-btn"
      >
        <RefreshCw size={10} />
        Refresh trend · Last {hours}h · {airport}
      </button>
    </div>
  );
}
