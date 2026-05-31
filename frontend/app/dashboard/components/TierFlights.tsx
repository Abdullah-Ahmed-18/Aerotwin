'use client';

import { useMemo } from 'react';
import { useSimulation } from '@/lib/SimulationContext';
import { formatSeconds } from '@/lib/formatSeconds';
import { Plane, Timer, AlertTriangle, CheckCircle2, XCircle, Zap, Activity, Clock } from 'lucide-react';

function getKpiBarColor(index: number, rawValue: number, barMax: number): string {
  if (index === 5) {
    // normScore 0-1
    return rawValue >= 0.8 ? '#10b981' : rawValue >= 0.5 ? '#f59e0b' : '#ef4444';
  }
  const ratio = barMax > 0 ? rawValue / barMax : 0;
  if (ratio <= 0.33) return '#10b981';
  if (ratio <= 0.66) return '#f59e0b';
  return '#ef4444';
}

export default function TierFlights() {
  const simulation = useSimulation();
  const flights = simulation.results?.flights || [];

  const globalMaxMqs = useMemo(
    () => Math.max(...flights.map((f) => f.kpiVector[2] || 0), 1),
    [flights]
  );

  const maxThroughput = useMemo(
    () => Math.max(...flights.map((f) => f.kpiVector[4] || 0), 1),
    [flights]
  );

  if (flights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-500">
        <Plane size={28} className="mb-2 opacity-40" />
        <p className="text-sm">No flight data</p>
      </div>
    );
  }

  const kpiLabels = ['Mean J.', 'P90 J.', 'Max Wait', 'Mean Dwell', 'Throughput', 'Score'];
  const kpiIcons = [Timer, Clock, AlertTriangle, Activity, Zap, CheckCircle2];

  return (
    <div className="space-y-2">
      {flights.map((flight) => {
        const kv = flight.kpiVector;
        const kpiValues = [
          formatSeconds(kv[0] || 0),
          formatSeconds(kv[1] || 0),
          formatSeconds(kv[2] || 0),
          formatSeconds(kv[3] || 0),
          `${(kv[4] || 0).toFixed(1)} p/h`,
          `${((kv[5] || 0) * 100).toFixed(0)}%`,
        ];

        return (
          <div key={flight.flightId} className="bg-white rounded-lg border border-slate-200 p-3 space-y-2.5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <Plane size={14} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">{flight.flightId}</p>
                  <p className="text-[9px] text-slate-500">{flight.passengers} passengers</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    flight.onTimeClearance
                      ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                      : 'text-rose-600 bg-rose-50 border-rose-100'
                  }`}
                >
                  {flight.onTimeClearance ? 'On Time' : 'Delayed'}
                </span>
              </div>
            </div>

            {/* Core stats */}
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1 text-slate-600">
                <Timer size={10} className="text-slate-400" />
                <span className="font-mono font-bold">{formatSeconds(flight.meanJourneyTime)}</span>
              </div>
              <div className="flex items-center gap-1 text-slate-600">
                <AlertTriangle size={10} className="text-slate-400" />
                <span>
                  Worst: <span className="font-bold">{flight.worstCheckpoint}</span>
                </span>
              </div>
            </div>

            {/* KPI Vector bars */}
            <div className="grid grid-cols-6 gap-1">
              {kpiLabels.map((label, idx) => {
                const Icon = kpiIcons[idx];
                const rawValue = kv[idx] || 0;
                const barMax = idx === 5 ? 1 : idx === 4 ? maxThroughput : globalMaxMqs;
                const barValue = idx === 5 ? rawValue : barMax > 0 ? rawValue / barMax : 0;
                const barColor = getKpiBarColor(idx, rawValue, barMax);

                return (
                  <div key={label} className="flex flex-col items-center gap-0.5">
                    <div className="w-full h-16 bg-slate-100 rounded-md relative overflow-hidden flex items-end justify-center">
                      <div
                        className="w-3/4 rounded-t-sm transition-all duration-500"
                        style={{
                          height: `${Math.min(barValue * 100, 100)}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    <Icon size={10} className="text-slate-400" />
                    <span className="text-[8px] font-bold text-slate-600 text-center leading-none">
                      {kpiValues[idx]}
                    </span>
                    <span className="text-[7px] text-slate-400 uppercase tracking-wider">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
