'use client';

import { useState } from 'react';
import { useSimulation } from '@/lib/SimulationContext';
import { formatSeconds } from '@/lib/formatSeconds';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Activity, ChevronDown, ChevronUp, Clock, Gauge, Zap } from 'lucide-react';

function getMqtColor(mqt: number): string {
  if (mqt <= 60) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
  if (mqt <= 180) return 'text-amber-600 bg-amber-50 border-amber-100';
  return 'text-rose-600 bg-rose-50 border-rose-100';
}

function getMqsColor(mqs: number): string {
  if (mqs <= 120) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
  if (mqs <= 300) return 'text-amber-600 bg-amber-50 border-amber-100';
  return 'text-rose-600 bg-rose-50 border-rose-100';
}

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

export default function TierCheckpoints() {
  const simulation = useSimulation();
  const checkpoints = simulation.results?.checkpoints || [];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (checkpoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-500">
        <Activity size={28} className="mb-2 opacity-40" />
        <p className="text-sm">No checkpoint data</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {checkpoints.map((cp) => {
        const isExpanded = expandedId === cp.id;
        return (
          <div key={cp.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : cp.id)}
              className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <Activity size={14} className="text-blue-500" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-800">{cp.id}</p>
                  <p className="text-[9px] text-slate-500">{cp.throughput.toFixed(1)} p/h throughput</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${getMqtColor(cp.mqt)}`}>
                  MQT {formatSeconds(cp.mqt)}
                </span>
                {isExpanded ? (
                  <ChevronUp size={14} className="text-slate-400" />
                ) : (
                  <ChevronDown size={14} className="text-slate-400" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-slate-100 space-y-3">
                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="p-2 bg-slate-50 rounded-md border border-slate-100">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Clock size={10} className="text-slate-400" />
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">MQS</span>
                    </div>
                    <span
                      className={`text-xs font-black ${
                        cp.mqs > 300 ? 'text-rose-600' : cp.mqs > 120 ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    >
                      {formatSeconds(cp.mqs)}
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-md border border-slate-100">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Clock size={10} className="text-slate-400" />
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">P90 Wait</span>
                    </div>
                    <span className="text-xs font-black text-slate-800">{formatSeconds(cp.p90Wait)}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded-md border border-slate-100">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Gauge size={10} className="text-slate-400" />
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Dwell</span>
                    </div>
                    <span className="text-xs font-black text-slate-800">{formatSeconds(cp.meanDwell)}</span>
                  </div>
                </div>

                {/* Time profile chart */}
                {cp.timeProfile && cp.timeProfile.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Zap size={10} />
                      Time Profile — Demand vs Throughput
                    </p>
                    <div className="h-32 bg-slate-50 rounded-lg border border-slate-100 p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={cp.timeProfile}
                          margin={{ top: 4, right: 4, bottom: 4, left: -16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="binLabel"
                            tick={{ fill: '#64748b', fontSize: 8 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            yAxisId="left"
                            tick={{ fill: '#64748b', fontSize: 8 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fill: '#64748b', fontSize: 8 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar
                            yAxisId="left"
                            dataKey="count"
                            name="Pax Count"
                            fill="#3b82f6"
                            radius={[2, 2, 0, 0]}
                            barSize={12}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="throughput"
                            name="Throughput"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
