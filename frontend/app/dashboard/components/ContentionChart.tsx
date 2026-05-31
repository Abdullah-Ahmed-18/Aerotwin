'use client';

import { useMemo } from 'react';
import { useSimulation } from '@/lib/SimulationContext';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Zap, Activity } from 'lucide-react';

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-slate-800 text-xs font-bold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-[10px]" style={{ color: p.color || p.fill }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function ContentionChart() {
  const simulation = useSimulation();
  const checkpoints = simulation.results?.checkpoints || [];

  const chartData = useMemo(() => {
    if (!checkpoints.length) return [];
    // Merge all time profiles by binLabel, summing count and averaging throughput
    const bins = new Map<
      string,
      { count: number; throughputSum: number; throughputCount: number }
    >();
    checkpoints.forEach((cp) => {
      cp.timeProfile?.forEach((tp) => {
        const existing = bins.get(tp.binLabel);
        if (existing) {
          existing.count += tp.count;
          existing.throughputSum += tp.throughput;
          existing.throughputCount += 1;
        } else {
          bins.set(tp.binLabel, {
            count: tp.count,
            throughputSum: tp.throughput,
            throughputCount: 1,
          });
        }
      });
    });
    return Array.from(bins.entries())
      .map(([binLabel, data]) => ({
        binLabel,
        count: data.count,
        throughput:
          data.throughputCount > 0 ? data.throughputSum / data.throughputCount : 0,
      }))
      .sort((a, b) => a.binLabel.localeCompare(b.binLabel));
  }, [checkpoints]);

  if (chartData.length === 0) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm p-4 flex-1 flex flex-col items-center justify-center text-slate-500">
        <Activity size={24} className="mb-2 opacity-40" />
        <p className="text-sm">No contention data</p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm p-4 flex-1 flex flex-col">
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <Zap size={14} className="text-amber-500" />
        <h3 className="text-slate-700 text-xs font-bold uppercase tracking-wider">
          Contention Timeline
        </h3>
        <span className="text-[9px] text-slate-400 ml-auto">Capacity vs Demand</span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="binLabel"
              tick={{ fill: '#64748b', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: '#64748b', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#64748b', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '10px', color: '#64748b' }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              yAxisId="left"
              dataKey="count"
              name="Demand (pax)"
              fill="#3b82f6"
              radius={[3, 3, 0, 0]}
              barSize={16}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="throughput"
              name="Throughput (p/h)"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
