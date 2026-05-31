'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Clock, Users, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Zap } from 'lucide-react';

// ─── Checkpoint definitions pulled from AerotwinConfig.json ─────────────────
interface Station {
  Station_ID: string;
  Staffing_No: number;
  Avg_Service_Time: number; // seconds
  Max_Queue_Cap: number;
  Efficiency_Factor: number;
}

interface Checkpoint {
  id: string;
  label: string;
  type: string;
  icon: string;
  stations: Station[];
  paxShare: number; // fraction of total pax that pass through this checkpoint
}

const CHECKPOINTS: Checkpoint[] = [
  {
    id: '1ST-SEC',
    label: 'Entry Security',
    type: 'Security',
    icon: '🛡️',
    paxShare: 1.0,
    stations: [
      { Station_ID: 'First Lane',  Staffing_No: 3, Avg_Service_Time: 60, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
      { Station_ID: 'Lane 2',      Staffing_No: 2, Avg_Service_Time: 60, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
      { Station_ID: 'Lane 3',      Staffing_No: 3, Avg_Service_Time: 60, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
    ],
  },
  {
    id: 'CHK-BAG',
    label: 'Check-in / Bag Drop',
    type: 'Check-in',
    icon: '🧳',
    paxShare: 0.6, // ~60% use traditional check-in
    stations: [
      { Station_ID: 'Economy 1',  Staffing_No: 1, Avg_Service_Time: 182, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
      { Station_ID: 'Economy 2',  Staffing_No: 1, Avg_Service_Time: 182, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
      { Station_ID: 'Economy 3',  Staffing_No: 1, Avg_Service_Time: 182, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
      { Station_ID: 'Business 1', Staffing_No: 1, Avg_Service_Time: 182, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
    ],
  },
  {
    id: 'DIG-CHK',
    label: 'Digital Check-in',
    type: 'Digital',
    icon: '📱',
    paxShare: 0.4, // ~40% use self-service kiosks
    stations: [
      { Station_ID: 'Kiosk 1', Staffing_No: 1, Avg_Service_Time: 90, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
      { Station_ID: 'Kiosk 2', Staffing_No: 1, Avg_Service_Time: 90, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
      { Station_ID: 'Kiosk 3', Staffing_No: 1, Avg_Service_Time: 90, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
    ],
  },
  {
    id: 'PAS-CHK',
    label: 'Passport Control',
    type: 'Passport',
    icon: '🛂',
    paxShare: 0.75, // international flights only (~75% typical share)
    stations: [
      { Station_ID: 'PC Lane 1', Staffing_No: 1, Avg_Service_Time: 60, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
      { Station_ID: 'PC Lane 2', Staffing_No: 1, Avg_Service_Time: 60, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
    ],
  },
  {
    id: '2ND-SEC',
    label: 'Gate Security',
    type: 'Security',
    icon: '🔒',
    paxShare: 1.0,
    stations: [
      { Station_ID: 'Sec Lane 1', Staffing_No: 1, Avg_Service_Time: 60, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
      { Station_ID: 'Sec Lane 2', Staffing_No: 2, Avg_Service_Time: 60, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
    ],
  },
  {
    id: 'BRD-GAT',
    label: 'Boarding Gate',
    type: 'Boarding',
    icon: '✈️',
    paxShare: 1.0,
    stations: [
      { Station_ID: 'Gate 1', Staffing_No: 1, Avg_Service_Time: 60, Max_Queue_Cap: 30, Efficiency_Factor: 1 },
    ],
  },
];

// ─── Erlang-C wait time model ─────────────────────────────────────────────────
// Returns estimated wait time in seconds using Erlang-C approximation.
// λ = arrival rate (pax/sec), μ = service rate per server (1/service_time), c = servers
function erlangCWait(lambda: number, mu: number, c: number): number {
  if (lambda <= 0 || mu <= 0 || c <= 0) return 0;
  const rho = lambda / (c * mu); // server utilisation
  if (rho >= 1) {
    // Overloaded — queue grows unboundedly; cap at a realistic max
    return Math.min((1 / mu) * c * 5, 3600);
  }
  const a = lambda / mu; // offered load (Erlangs)

  // Compute C(c, a) — probability that an arriving customer has to wait
  // Using the iterative formula for Erlang-C
  let B = 1.0; // Erlang-B recursion seed
  for (let i = 1; i <= c; i++) {
    B = (a * B) / (i + a * B);
  }
  const C = (c * B) / (c - a * (1 - B)); // Erlang-C probability
  const Clamped = Math.min(Math.max(C, 0), 1);

  // Expected wait in queue = C(c,a) / (c*μ - λ)
  const waitInQueue = Clamped / (c * mu - lambda);
  return waitInQueue; // seconds
}

// ─── Per-checkpoint result ────────────────────────────────────────────────────
interface CheckpointResult {
  checkpoint: Checkpoint;
  totalAgents: number;           // sum of Staffing_No across all stations
  totalCapacity: number;         // sum of Max_Queue_Cap
  arrivalRate: number;           // pax/second
  avgServiceTime: number;        // weighted average service time (seconds)
  utilisation: number;           // 0–1
  waitSecs: number;              // estimated queue wait
  queueLength: number;           // expected number in queue
  status: 'ok' | 'warning' | 'critical';
}

function computeWait(cp: Checkpoint, totalPax: number, windowMinutes: number): CheckpointResult {
  const pax = Math.round(totalPax * cp.paxShare);
  const windowSecs = windowMinutes * 60;
  const lambda = pax / windowSecs; // arrival rate (pax/sec)

  // Aggregate stations
  const totalAgents = cp.stations.reduce((s, st) => s + st.Staffing_No, 0);
  const totalCapacity = cp.stations.reduce((s, st) => s + st.Max_Queue_Cap, 0);

  // Weighted-average service time (weighted by Staffing_No)
  const weightedSvc = cp.stations.reduce((s, st) => s + st.Avg_Service_Time * st.Staffing_No, 0);
  const avgServiceTime = totalAgents > 0 ? weightedSvc / totalAgents : 60;

  const mu = 1 / avgServiceTime; // service rate per agent (pax/sec)
  const utilisation = lambda / (totalAgents * mu);

  const waitSecs = erlangCWait(lambda, mu, totalAgents);
  const queueLength = lambda * waitSecs; // Little's Law: L = λW

  const status: CheckpointResult['status'] =
    utilisation >= 0.9 ? 'critical' :
    utilisation >= 0.7 ? 'warning' : 'ok';

  return {
    checkpoint: cp,
    totalAgents,
    totalCapacity,
    arrivalRate: lambda,
    avgServiceTime,
    utilisation,
    waitSecs,
    queueLength,
    status,
  };
}

function formatTime(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function statusColor(s: CheckpointResult['status']) {
  switch (s) {
    case 'critical': return { bar: 'bg-rose-500', text: 'text-rose-600', border: 'border-rose-500/30', bg: 'bg-rose-500/10' };
    case 'warning':  return { bar: 'bg-amber-400', text: 'text-amber-600', border: 'border-amber-500/30', bg: 'bg-amber-500/10' };
    default:         return { bar: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' };
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  flights: any[];
  airport?: string;
}

function parseNum(raw: string | number | undefined, fallback = 0): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const m = raw.match(/\d+(\.\d+)?/);
    if (m) return parseFloat(m[0]);
  }
  return fallback;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function QueueWaitEstimator({ flights, airport = 'HBE' }: Props) {
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPax = useMemo(() => {
    if (!Array.isArray(flights) || flights.length === 0) return 0;
    return flights.reduce((sum, f) => {
      const cap  = parseNum(f?.aircraft?.capacity, 180);
      const pax  = parseNum(f?.payload_stats?.total_passengers, Math.floor(cap * 0.8));
      return sum + Math.min(pax, cap);
    }, 0);
  }, [flights]);

  const results = useMemo<CheckpointResult[]>(() => {
    return CHECKPOINTS.map(cp => computeWait(cp, totalPax, windowMinutes));
  }, [totalPax, windowMinutes]);

  // ── Auto-save queue snapshot to DB (debounced 5s) ───────────────────────────
  useEffect(() => {
    if (results.length === 0 || totalPax === 0) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const payload = results.map(r => ({
          checkpoint_id:    r.checkpoint.id,
          checkpoint_label: r.checkpoint.label,
          checkpoint_type:  r.checkpoint.type,
          flow_type:        'departure',
          utilisation:      r.utilisation,
          queue_length:     r.queueLength,
          wait_secs:        r.waitSecs,
          arrival_rate:     r.arrivalRate,
          total_agents:     r.totalAgents,
          status:           r.status,
        }));
        await fetch('http://localhost:5000/api/analytics/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ airport, results: payload }),
        });
      } catch {
        // Non-blocking — ignore errors
      }
    }, 5000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [results, airport, totalPax]);

  const criticalCount = results.filter(r => r.status === 'critical').length;
  const warningCount  = results.filter(r => r.status === 'warning').length;
  const totalWait     = results.reduce((s, r) => s + r.waitSecs, 0);

  if (!Array.isArray(flights) || flights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-500">
        <Clock size={32} className="mb-2 opacity-30" />
        <p className="text-sm">No flight data available</p>
        <p className="text-[10px] mt-1 text-slate-600">Import flights to see queue estimates</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">Total Pax</p>
          <p className="text-slate-800 font-bold text-sm mt-0.5">{totalPax.toLocaleString()}</p>
        </div>
        <div className={`p-2 rounded-lg border text-center ${criticalCount > 0 ? 'bg-rose-500/10 border-rose-500/30' : 'bg-slate-50 border-slate-200'}`}>
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">Critical</p>
          <p className={`font-bold text-sm mt-0.5 ${criticalCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{criticalCount}</p>
        </div>
        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-center">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">Total Wait</p>
          <p className="text-cyan-600 font-bold text-sm mt-0.5">{formatTime(totalWait)}</p>
        </div>
      </div>

      {/* Window Selector */}
      <div className="flex items-center gap-2">
        <span className="text-slate-500 text-[9px] uppercase tracking-wider shrink-0">Window:</span>
        <div className="flex gap-1 flex-1">
          {[30, 60, 90, 120].map(w => (
            <button
              key={w}
              onClick={() => setWindowMinutes(w)}
              className={`flex-1 py-1 rounded-md text-[9px] font-bold uppercase tracking-wide transition-all ${
                windowMinutes === w
                  ? 'bg-cyan-600 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {w}m
            </button>
          ))}
        </div>
      </div>

      {/* Checkpoint Cards */}
      <div className="space-y-2">
        {results.map((r) => {
          const c = statusColor(r.status);
          const isExpanded = expandedId === r.checkpoint.id;
          const utilisationPct = Math.min(Math.round(r.utilisation * 100), 100);

          return (
            <div
              key={r.checkpoint.id}
              className={`rounded-lg border ${c.border} ${c.bg} overflow-hidden transition-all duration-300`}
            >
              {/* Header Row */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
                onClick={() => setExpandedId(isExpanded ? null : r.checkpoint.id)}
              >
                <span className="text-base shrink-0">{r.checkpoint.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-700 text-[10px] font-bold truncate">{r.checkpoint.label}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {r.status === 'critical' && <AlertTriangle size={10} className="text-rose-400" />}
                      {r.status === 'ok' && <CheckCircle size={10} className="text-emerald-400" />}
                      <span className={`text-[10px] font-bold ${c.text}`}>
                        {formatTime(r.waitSecs)}
                      </span>
                      {isExpanded ? <ChevronUp size={10} className="text-slate-500" /> : <ChevronDown size={10} className="text-slate-500" />}
                    </div>
                  </div>
                  {/* Utilisation bar */}
                  <div className="mt-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${c.bar}`}
                      style={{ width: `${utilisationPct}%` }}
                    />
                  </div>
                </div>
              </button>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0 border-t border-slate-100 space-y-2">
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-slate-50 rounded-md p-2">
                      <p className="text-slate-500 text-[9px] uppercase">Utilisation</p>
                      <p className={`text-sm font-bold ${c.text}`}>{utilisationPct}%</p>
                    </div>
                    <div className="bg-slate-50 rounded-md p-2">
                      <p className="text-slate-500 text-[9px] uppercase">Pax / min</p>
                      <p className="text-slate-800 text-sm font-bold">{(r.arrivalRate * 60).toFixed(1)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-md p-2">
                      <p className="text-slate-500 text-[9px] uppercase">Agents</p>
                      <p className="text-slate-800 text-sm font-bold">{r.totalAgents}</p>
                    </div>
                    <div className="bg-slate-50 rounded-md p-2">
                      <p className="text-slate-500 text-[9px] uppercase">Queue Est.</p>
                      <p className="text-slate-800 text-sm font-bold">{Math.ceil(r.queueLength)} pax</p>
                    </div>
                    <div className="bg-slate-50 rounded-md p-2">
                      <p className="text-slate-500 text-[9px] uppercase">Svc Time</p>
                      <p className="text-slate-800 text-sm font-bold">{formatTime(r.avgServiceTime)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-md p-2">
                      <p className="text-slate-500 text-[9px] uppercase">Max Cap</p>
                      <p className="text-slate-800 text-sm font-bold">{r.totalCapacity}</p>
                    </div>
                  </div>

                  {/* Station breakdown */}
                  <div className="space-y-1">
                    <p className="text-slate-500 text-[9px] uppercase tracking-wider">Stations</p>
                    {r.checkpoint.stations.map(st => (
                      <div key={st.Station_ID} className="flex items-center justify-between text-[9px]">
                        <span className="text-slate-400">{st.Station_ID}</span>
                        <span className="text-slate-500">{st.Staffing_No} staff · {st.Avg_Service_Time}s svc</span>
                      </div>
                    ))}
                  </div>

                  {r.status === 'critical' && (
                    <div className="flex items-start gap-2 p-2 bg-rose-500/10 rounded-md border border-rose-500/20">
                      <Zap size={10} className="text-rose-400 mt-0.5 shrink-0" />
                      <p className="text-rose-600 text-[9px]">
                        Queue utilisation exceeds 90% — consider opening additional stations or diverting pax to alternate checkpoints.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
