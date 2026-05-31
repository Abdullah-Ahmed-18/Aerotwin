'use client';

import { useSimulation } from '@/lib/SimulationContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft, Users, Clock, Gauge, BarChart3, AlertTriangle, CheckCircle2,
  Plane, ChevronDown, ChevronUp, Activity, Zap, Target, Timer, Play
} from 'lucide-react';

const API_BASE = 'http://localhost:5000';

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

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

export default function SimulationPage() {
  const router = useRouter();
  const simulation = useSimulation();
  const [expandedFlight, setExpandedFlight] = useState<string | null>(null);
  const [flightEvents, setFlightEvents] = useState<Record<string, any[]>>({});
  const [loadingEvents, setLoadingEvents] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!simulation.results && simulation.runStatus === 'idle') {
      router.push('/dashboard');
    }
  }, [simulation.results, simulation.runStatus, router]);

  if (!simulation.results) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-4">
          <Activity size={48} className="text-slate-600 mx-auto animate-pulse" />
          <p className="text-slate-400 text-sm font-medium">No simulation results available</p>
          <button onClick={() => router.push('/active-flights')} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors">
            Go to Flights
          </button>
        </div>
      </div>
    );
  }

  const { summary, checkpoints, flights } = simulation.results;

  const fetchFlightEvents = async (flightId: string) => {
    if (flightEvents[flightId] || !simulation.currentRunId) return;
    setLoadingEvents(prev => ({ ...prev, [flightId]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/runs/${simulation.currentRunId}/events?flight=${encodeURIComponent(flightId)}`);
      const data = await res.json();
      if (res.ok) {
        setFlightEvents(prev => ({ ...prev, [flightId]: data.rows || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoadingEvents(prev => ({ ...prev, [flightId]: false }));
    }
  };

  const toggleFlightExpand = (flightId: string) => {
    if (expandedFlight === flightId) {
      setExpandedFlight(null);
    } else {
      setExpandedFlight(flightId);
      fetchFlightEvents(flightId);
    }
  };

  return (
    <div className="flex-1 bg-slate-950 text-white overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/dashboard')} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
              <ArrowLeft size={18} className="text-slate-400" />
            </button>
            <div>
              <h1 className="text-lg font-bold tracking-wide">Simulation Results</h1>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Run ID: {simulation.results.runId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black px-3 py-1.5 rounded-full border uppercase tracking-widest ${
              simulation.runStatus === 'completed'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {simulation.runStatus}
            </span>
            {simulation.runStatus === 'completed' && (
              <button
                onClick={() => simulation.viewReplay(simulation.results!.runId)}
                className="px-3 py-1.5 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-1"
              >
                <Play size={12} />
                View Replay
              </button>
            )}
            <button onClick={simulation.clearRun} className="px-3 py-1.5 text-[10px] font-bold text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors">
              Clear Results
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8 max-w-7xl mx-auto">
        {/* TIER 1: Run Summary */}
        <section>
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Target size={14} className="text-blue-400" />
            Run Summary
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-blue-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total PAX</span>
              </div>
              <p className="text-2xl font-black text-white">{summary.totalPassengers}</p>
              <p className="text-[10px] text-slate-500 mt-1">{summary.completedPassengers} completed</p>
            </div>
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={14} className="text-emerald-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mean Journey</span>
              </div>
              <p className="text-2xl font-black text-white">{formatSeconds(summary.meanJourneyTime)}</p>
              <p className="text-[10px] text-slate-500 mt-1">P90: {formatSeconds(summary.p90JourneyTime)}</p>
            </div>
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <Gauge size={14} className="text-amber-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">KPI Score</span>
              </div>
              <p className="text-2xl font-black text-white">{summary.weightedKpiScore.toFixed(1)}</p>
              <p className="text-[10px] text-slate-500 mt-1">/ 100 weighted</p>
            </div>
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={14} className="text-purple-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Checkpoints</span>
              </div>
              <p className="text-2xl font-black text-white">{checkpoints.length}</p>
              <p className="text-[10px] text-slate-500 mt-1">{flights.length} flights analyzed</p>
            </div>
          </div>
        </section>

        {/* TIER 2: Checkpoint Breakdown */}
        <section>
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Activity size={14} className="text-emerald-400" />
            Checkpoint Breakdown
          </h2>
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/50">
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Checkpoint</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">MQT</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">MQS</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">P90 Wait</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Mean Dwell</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Throughput</th>
                  </tr>
                </thead>
                <tbody>
                  {checkpoints.map((cp) => (
                    <tr key={cp.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold text-white">{cp.id}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${getMqtColor(cp.mqt)}`}>
                          {formatSeconds(cp.mqt)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${getMqsColor(cp.mqs)}`}>
                          {formatSeconds(cp.mqs)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-mono text-slate-300">{formatSeconds(cp.p90Wait)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-mono text-slate-300">{formatSeconds(cp.meanDwell)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-mono text-blue-400">{cp.throughput.toFixed(1)} p/h</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* TIER 3: Per-Flight */}
        <section>
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Plane size={14} className="text-blue-400" />
            Per-Flight Analysis
          </h2>
          <div className="space-y-3">
            {flights.map((flight) => (
              <div key={flight.flightId} className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <button
                  onClick={() => toggleFlightExpand(flight.flightId)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Plane size={18} className="text-blue-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-white">{flight.flightId}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{flight.passengers} passengers</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs font-mono text-slate-300">{formatSeconds(flight.meanJourneyTime)} avg</p>
                      <p className="text-[10px] text-slate-500">Worst: {flight.worstCheckpoint}</p>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${
                      flight.onTimeClearance
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}>
                      {flight.onTimeClearance ? 'On Time' : 'Delayed'}
                    </div>
                    {expandedFlight === flight.flightId ? (
                      <ChevronUp size={16} className="text-slate-500" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-500" />
                    )}
                  </div>
                </button>

                {expandedFlight === flight.flightId && (
                  <div className="px-5 pb-5 border-t border-slate-800">
                    {/* KPI Vector */}
                    <div className="py-4 grid grid-cols-3 md:grid-cols-6 gap-3">
                      {[
                        { label: 'Mean Journey', value: formatSeconds(flight.kpiVector[0] || 0), icon: Timer },
                        { label: 'P90 Journey', value: formatSeconds(flight.kpiVector[1] || 0), icon: Clock },
                        { label: 'Max Wait', value: formatSeconds(flight.kpiVector[2] || 0), icon: AlertTriangle },
                        { label: 'Mean Dwell', value: formatSeconds(flight.kpiVector[3] || 0), icon: Activity },
                        { label: 'Throughput', value: `${(flight.kpiVector[4] || 0).toFixed(1)} p/h`, icon: Zap },
                        { label: 'Completion', value: `${((flight.kpiVector[5] || 0) * 100).toFixed(0)}%`, icon: CheckCircle2 },
                      ].map((kpi, idx) => (
                        <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                          <div className="flex items-center gap-1.5 mb-1">
                            <kpi.icon size={10} className="text-slate-500" />
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</span>
                          </div>
                          <p className="text-sm font-black text-white">{kpi.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Events Table */}
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Passenger Events</h4>
                      {loadingEvents[flight.flightId] ? (
                        <div className="py-8 text-center">
                          <Activity size={20} className="text-slate-600 animate-spin mx-auto mb-2" />
                          <p className="text-[10px] text-slate-500">Loading events...</p>
                        </div>
                      ) : flightEvents[flight.flightId]?.length > 0 ? (
                        <div className="overflow-x-auto max-h-64 overflow-y-auto scrollbar-hide">
                          <table className="w-full text-left text-[10px]">
                            <thead className="sticky top-0 bg-slate-800">
                              <tr className="border-b border-slate-700">
                                <th className="px-2 py-1.5 font-bold text-slate-400">Passenger</th>
                                <th className="px-2 py-1.5 font-bold text-slate-400">Checkpoint</th>
                                <th className="px-2 py-1.5 font-bold text-slate-400">Wait</th>
                                <th className="px-2 py-1.5 font-bold text-slate-400">Dwell</th>
                              </tr>
                            </thead>
                            <tbody>
                              {flightEvents[flight.flightId].map((row, idx) => (
                                <tr key={idx} className="border-b border-slate-800/50">
                                  <td className="px-2 py-1.5 text-slate-300 font-mono">{row.Passenger || row['Passenger']}</td>
                                  <td className="px-2 py-1.5 text-slate-300">{row.Checkpoint || row['Checkpoint']}</td>
                                  <td className="px-2 py-1.5 text-slate-300 font-mono">{row.WaitTime || row['WaitTime']}</td>
                                  <td className="px-2 py-1.5 text-slate-300 font-mono">{row.TotalDwell || row['TotalDwell']}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-600 py-4">No events found for this flight.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Contention Timeline Placeholder */}
        <section>
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Zap size={14} className="text-amber-400" />
            Contention Timeline
          </h2>
          <div className="p-8 bg-slate-900 rounded-xl border border-slate-800 border-dashed flex flex-col items-center justify-center gap-3">
            <Activity size={32} className="text-slate-700" />
            <p className="text-sm font-bold text-slate-500">Capacity vs Demand Visualization</p>
            <p className="text-[10px] text-slate-600 max-w-md text-center">
              This panel will display per-flight demand curves overlaid with checkpoint capacity envelopes.
              Coming in the next iteration.
            </p>
            {flights.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 justify-center">
                {flights.map(f => (
                  <span key={f.flightId} className="px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-[9px] font-bold text-slate-400">
                    {f.flightId}: {f.passengers} pax
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
