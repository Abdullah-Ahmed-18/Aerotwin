'use client';

import { useEffect, useState } from 'react';
import {
  FileText,
  TrendingUp,
  TrendingDown,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  Share2,
  Loader2,
  AlertTriangle,
  Clock,
  Wrench,
  CheckCircle2,
} from 'lucide-react';

interface StationInsight {
  checkpoint_id: string;
  station_id: string;
  p95_delta_min: number;
  baseline_p95: number;
  inferred_p95: number;
}

interface CheckpointInsight {
  checkpoint_id: string;
  p95_delta_min: number;
  baseline_p95: number;
  inferred_p95: number;
}

interface InsightsStructured {
  baseline_reward: number;
  inferred_reward: number;
  reward_delta: number;
  completion_delta: number;
  mean_journey_delta_min: number;
  p95_journey_delta_min: number;
  top_improvements: CheckpointInsight[];
  top_regressions: CheckpointInsight[];
  station_improvements: StationInsight[];
  station_regressions: StationInsight[];
  iata_compliance: Record<string, number>;
  total_checkpoints: number;
  operational_changes: Array<{
    checkpoint: string;
    station?: string;
    action: string;
  }>;
  total_checkpoint_p95_delta: number;
  total_station_p95_delta: number;
  total_improvements_p95: number;
  total_regressions_p95: number;
  improvement_count: number;
  regression_count: number;
}

interface InsightsData {
  summary: string;
  structured: InsightsStructured;
  model_used: string;
  comparison_file: string;
  already_optimized?: boolean;
}

function formatMin(m: number): string {
  if (m <= 0) return '0:00';
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function runIdFromFilename(filename: string): string {
  const m = filename.match(/comparison_(\d{8}_\d{6})/);
  return m ? `SIM-OPT-${m[1].slice(-6)}` : 'SIM-OPT-000';
}

export default function InsightsPanel() {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const latestRes = await fetch('http://localhost:5000/api/comparisons/latest');
        if (!latestRes.ok) throw new Error('No comparison files available');
        const { filename } = await latestRes.json();
        const insightsRes = await fetch('http://localhost:5000/api/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comparison_file: filename }),
        });
        if (!insightsRes.ok) {
          const err = await insightsRes.json();
          throw new Error(err.error || 'Failed to load insights');
        }
        const data = await insightsRes.json();
        if (!cancelled) setInsights(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f7f9fb]">
        <Loader2 size={24} className="text-[#004ac6] animate-spin mr-2" />
        <span className="font-['Inter'] text-sm text-[#434655]">Loading insights...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#f7f9fb]">
        <AlertTriangle size={24} className="mb-2 text-[#ba1a1a]" />
        <p className="font-['Inter'] text-sm text-[#434655]">{error}</p>
        <p className="font-['Inter'] text-xs mt-1 text-[#737686]">Run a simulation to generate insights</p>
      </div>
    );
  }

  if (!insights) return null;

  if (insights.already_optimized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#f7f9fb] p-8">
        <div className="max-w-xl w-full bg-white rounded-2xl border border-emerald-200 shadow-sm p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Already Well-Optimized</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{insights.summary}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Performance</p>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Baseline Reward</span>
              <span className="font-mono font-bold text-slate-800">{insights.structured.baseline_reward?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">AI Reward</span>
              <span className="font-mono font-bold text-slate-800">{insights.structured.inferred_reward?.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-xs text-slate-400">No configuration changes are recommended at this time.</p>
        </div>
      </div>
    );
  }

  const s = insights.structured;
  // Fallbacks for old comparison files generated before total-delta fields were added
  const totalCheckpointP95Delta = s.total_checkpoint_p95_delta ?? 0;
  const totalImprovementsP95 = s.total_improvements_p95 ?? 0;
  const totalRegressionsP95 = s.total_regressions_p95 ?? 0;
  const improvementCount = s.improvement_count ?? s.top_improvements.length;
  const regressionCount = s.regression_count ?? s.top_regressions.length;
  const runId = runIdFromFilename(insights.comparison_file);
  const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const rewardUp = s.reward_delta >= 0;
  const rewardPct = s.baseline_reward !== 0
    ? Math.abs(Math.round((s.reward_delta / Math.abs(s.baseline_reward)) * 100))
    : 0;

  const nonCompliant = (s.iata_compliance.over_design || 0) + (s.iata_compliance.unknown || 0);

  // Build checkpoint-level ops list from top_improvements + top_regressions
  const checkpointOps: Record<string, { type: 'improvement' | 'regression'; p95_delta: number; baseline_p95: number; inferred_p95: number }> = {};
  s.top_improvements.forEach((imp) => {
    checkpointOps[imp.checkpoint_id] = { type: 'improvement', p95_delta: imp.p95_delta_min, baseline_p95: imp.baseline_p95, inferred_p95: imp.inferred_p95 };
  });
  s.top_regressions.forEach((reg) => {
    checkpointOps[reg.checkpoint_id] = { type: 'regression', p95_delta: reg.p95_delta_min, baseline_p95: reg.baseline_p95, inferred_p95: reg.inferred_p95 };
  });

  // Group station insights by checkpoint
  const stationGroups: Record<string, { improvements: StationInsight[]; regressions: StationInsight[] }> = {};
  s.station_improvements.forEach((st) => {
    if (!stationGroups[st.checkpoint_id]) stationGroups[st.checkpoint_id] = { improvements: [], regressions: [] };
    stationGroups[st.checkpoint_id].improvements.push(st);
  });
  s.station_regressions.forEach((st) => {
    if (!stationGroups[st.checkpoint_id]) stationGroups[st.checkpoint_id] = { improvements: [], regressions: [] };
    stationGroups[st.checkpoint_id].regressions.push(st);
  });

  // Group operational changes by checkpoint
  const opsByCheckpoint: Record<string, string[]> = {};
  s.operational_changes.forEach((ch) => {
    const cid = ch.checkpoint;
    if (!opsByCheckpoint[cid]) opsByCheckpoint[cid] = [];
    opsByCheckpoint[cid].push(ch.action);
  });

  // Checkpoint names mapping (fallback to ID)
  const checkpointNames: Record<string, string> = {
    '1ST-SEC': 'Primary Security Screening',
    'CHK-BAG': 'Baggage Drop Counter',
    'DIG-CHK': 'Digital Check-in Kiosks',
    'PAS-CHK': 'Passport Control',
    '2ND-SEC': 'Secondary Audit Zone',
    'BRD-GAT': 'Boarding Gate Area',
    'ARV-GAT': 'Arrival Gate',
    'ARV-TERM': 'Arrival Terminal',
    'PAS-CTRL': 'Passport Control',
    'BAG-CLM': 'Baggage Retrieval',
    'EXIT-SEC': 'Exit Security',
    'SLF-BAG': 'Self-Service Bag Drop',
    'DEPARTING-TERMINAL': 'Departing Terminal',
  };

  const allCheckpointKeys = Object.keys(checkpointOps).sort();

  return (
    <main className="pt-20 px-6 pb-16 max-w-6xl mx-auto font-['Inter']">
      {/* Executive Summary */}
      <section className="bg-[#f2f4f6] border border-[#c3c6d7] rounded p-6 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <FileText size={20} className="text-[#004ac6]" />
          <h2 className="font-['Space_Grotesk'] font-semibold text-2xl text-[#191c1e]">Executive Summary</h2>
        </div>
        <p className="font-['Inter'] text-base leading-relaxed text-[#434655]">
          {insights.summary.split('\n')[0] || insights.summary}
        </p>
      </section>

      {/* Hero Summary Band */}
      <section className="bg-white border border-[#c3c6d7] rounded p-6 mb-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="font-['Inter'] text-xs font-semibold text-[#505f76] tracking-widest uppercase">Run ID: {runId}</span>
              <span className="font-['Inter'] text-xs text-[#505f76]">•</span>
              <span className="font-['Inter'] text-xs text-[#505f76]">{now}</span>
            </div>
            <h1 className="font-['Space_Grotesk'] font-semibold text-[32px] leading-10 text-[#191c1e]">Reward Optimization</h1>
            <div className="flex items-center gap-2">
              <span className="font-['Inter'] text-sm font-medium text-[#505f76]">
                {s.baseline_reward.toFixed(2)} → {s.inferred_reward.toFixed(2)}
              </span>
              <span className={`px-2 py-1 rounded-full font-['Inter'] text-xs font-semibold flex items-center gap-1 ${rewardUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {rewardUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {rewardUp ? '+' : ''}{s.reward_delta.toFixed(2)} ({rewardUp ? '+' : ''}{rewardPct}%)
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full max-w-xs h-2 bg-[#f2f4f6] rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-[#2563eb] transition-all duration-1000"
                style={{ width: `${Math.min(Math.max(rewardPct, 5), 100)}%` }}
              />
            </div>
          </div>

          {/* IATA Compliance Grid */}
          <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
            <div className="p-3 bg-green-50 border border-green-200 rounded flex flex-col items-center min-w-[100px]">
              <span className="text-green-700 font-bold text-lg font-['Space_Grotesk]">{s.iata_compliance.optimum || 0}</span>
              <span className="text-green-600 text-xs font-semibold font-['Inter']">Optimum</span>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded flex flex-col items-center min-w-[100px]">
              <span className="text-amber-700 font-bold text-lg font-['Space_Grotesk]">{s.iata_compliance.sub_optimum || 0}</span>
              <span className="text-amber-600 text-xs font-semibold font-['Inter']">Sub-optimum</span>
            </div>
            <div className="p-3 bg-[#ffdad6] border border-[#ba1a1a] rounded flex flex-col items-center min-w-[100px]">
              <span className="text-[#ba1a1a] font-bold text-lg font-['Space_Grotesk]">{nonCompliant}</span>
              <span className="text-[#ba1a1a] text-xs font-semibold font-['Inter']">Non-compliant</span>
            </div>
          </div>
        </div>
      </section>

      {/* Total Time Impact */}
      <section className="bg-white border border-[#c3c6d7] rounded p-6 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <Clock size={20} className="text-[#004ac6]" />
          <h3 className="font-['Space_Grotesk'] font-semibold text-xl text-[#191c1e]">Total Time Impact</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Net Checkpoint Delta */}
          <div className={`p-4 rounded border flex flex-col items-center justify-center ${
            s.total_checkpoint_p95_delta <= 0
              ? 'bg-green-50 border-green-200'
              : 'bg-[#ffdad6] border-[#ba1a1a]'
          }`}>
            <span className={`font-['Space_Grotesk'] font-bold text-3xl ${
              totalCheckpointP95Delta <= 0 ? 'text-green-700' : 'text-[#ba1a1a]'
            }`}>
              {totalCheckpointP95Delta <= 0 ? '' : '+'}{totalCheckpointP95Delta.toFixed(1)}m
            </span>
            <span className={`font-['Inter'] text-xs font-semibold mt-1 ${
              totalCheckpointP95Delta <= 0 ? 'text-green-600' : 'text-[#ba1a1a]'
            }`}>
              Net Checkpoint P95
            </span>
            <span className="font-['Inter'] text-[10px] text-[#737686] mt-0.5">
              {totalCheckpointP95Delta <= 0 ? 'Time saved across all checkpoints' : 'Time added across all checkpoints'}
            </span>
          </div>

          {/* Time Saved vs Time Added */}
          <div className="p-4 bg-[#f2f4f6] border border-[#c3c6d7] rounded flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2">
              <span className="font-['Inter'] text-xs text-[#505f76]">Time Saved (improvements)</span>
              <span className="font-['Space_Grotesk'] font-bold text-green-700">
                {Math.abs(totalImprovementsP95).toFixed(1)}m
              </span>
            </div>
            <div className="w-full h-2 bg-green-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-green-600 rounded-full"
                style={{ width: `${Math.min(Math.abs(totalImprovementsP95) / (Math.abs(totalImprovementsP95) + Math.abs(totalRegressionsP95) || 1) * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-['Inter'] text-xs text-[#505f76]">Time Added (regressions)</span>
              <span className="font-['Space_Grotesk'] font-bold text-[#ba1a1a]">
                +{totalRegressionsP95.toFixed(1)}m
              </span>
            </div>
            <div className="w-full h-2 bg-[#ffdad6] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#ba1a1a] rounded-full"
                style={{ width: `${Math.min(totalRegressionsP95 / (Math.abs(totalImprovementsP95) + Math.abs(totalRegressionsP95) || 1) * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Journey Time Delta */}
          <div className={`p-4 rounded border flex flex-col items-center justify-center ${
            s.p95_journey_delta_min <= 0
              ? 'bg-green-50 border-green-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <span className={`font-['Space_Grotesk'] font-bold text-3xl ${
              s.p95_journey_delta_min <= 0 ? 'text-green-700' : 'text-amber-700'
            }`}>
              {s.p95_journey_delta_min <= 0 ? '' : '+'}{s.p95_journey_delta_min.toFixed(1)}m
            </span>
            <span className={`font-['Inter'] text-xs font-semibold mt-1 ${
              s.p95_journey_delta_min <= 0 ? 'text-green-600' : 'text-amber-700'
            }`}>
              P95 Journey Time
            </span>
            <span className="font-['Inter'] text-[10px] text-[#737686] mt-0.5">
              End-to-end passenger experience
            </span>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#f2f4f6]">
          <span className="px-3 py-1 bg-green-50 border border-green-100 rounded-full font-['Inter'] text-xs text-green-700 font-medium">
            {improvementCount} checkpoint{improvementCount !== 1 ? 's' : ''} improved
          </span>
          {s.regression_count > 0 && (
            <span className="px-3 py-1 bg-[#ffdad6] border border-[#ba1a1a] rounded-full font-['Inter'] text-xs text-[#ba1a1a] font-medium">
              {regressionCount} checkpoint{regressionCount !== 1 ? 's' : ''} regressed
            </span>
          )}
          <span className="px-3 py-1 bg-[#f2f4f6] border border-[#c3c6d7] rounded-full font-['Inter'] text-xs text-[#505f76] font-medium">
            {s.total_checkpoints} total checkpoints
          </span>
        </div>
      </section>

      {/* Tier 2: Improvements and Regressions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Improvements */}
        <div className="bg-white border border-[#c3c6d7] rounded p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-green-600 rounded-full" />
            <h3 className="font-['Inter'] font-semibold text-lg text-[#191c1e]">Biggest Improvements</h3>
          </div>
          {s.top_improvements.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {s.top_improvements.map((imp) => (
                <div
                  key={imp.checkpoint_id}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-50 border border-green-100 rounded text-green-700 font-['Inter'] text-sm font-medium"
                >
                  {imp.checkpoint_id}
                  <ArrowDown size={14} />
                  {Math.abs(imp.p95_delta_min).toFixed(1)}m
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#737686]">No significant checkpoint-level improvements detected.</p>
          )}
        </div>

        {/* Regressions */}
        <div className="bg-white border border-[#c3c6d7] rounded p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-6 bg-[#ba1a1a] rounded-full" />
            <h3 className="font-['Inter'] font-semibold text-lg text-[#191c1e]">Watch for Regressions</h3>
          </div>
          {s.top_regressions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {s.top_regressions.map((reg) => (
                <div
                  key={reg.checkpoint_id}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded font-['Inter'] text-sm font-medium ${
                    reg.p95_delta_min > 1
                      ? 'bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a]'
                      : 'bg-amber-50 border border-amber-100 text-amber-700'
                  }`}
                >
                  {reg.checkpoint_id}
                  <ArrowUp size={14} />
                  +{reg.p95_delta_min.toFixed(1)}m
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#737686]">No significant checkpoint-level regressions detected.</p>
          )}
        </div>
      </div>

      {/* Tier 3: Items for Operations Team */}
      {allCheckpointKeys.length > 0 && (
        <section className="bg-white border border-[#c3c6d7] rounded mb-4">
          <div className="flex justify-between items-center p-6 border-b border-[#c3c6d7]">
            <h3 className="font-['Space_Grotesk'] font-semibold text-2xl text-[#191c1e]">Items for Operations Team</h3>
            <div className="flex gap-2">
              <button className="px-4 py-1.5 border border-[#737686] rounded font-['Inter'] text-xs font-semibold hover:bg-[#eceef0] transition-all flex items-center gap-1 text-[#191c1e]">
                <Copy size={14} /> Copy All
              </button>
              <button className="px-4 py-1.5 bg-[#004ac6] text-white rounded font-['Inter'] text-xs font-semibold hover:bg-[#2563eb] transition-all flex items-center gap-1">
                <Share2 size={14} /> Export
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#c3c6d7]">
            {allCheckpointKeys.map((ckId) => {
              const op = checkpointOps[ckId];
              const group = stationGroups[ckId] || { improvements: [], regressions: [] };
              const isExpanded = expandedCard === ckId;
              const hasRegression = op.type === 'regression';
              const hasStationData = group.improvements.length > 0 || group.regressions.length > 0;
              const name = checkpointNames[ckId] || ckId;

              return (
                <div key={ckId} className="group">
                  <button
                    className="w-full flex justify-between items-center p-6 hover:bg-[#f2f4f6] transition-colors"
                    onClick={() => setExpandedCard(isExpanded ? null : ckId)}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-2 rounded font-['Inter'] text-sm font-medium ${hasRegression ? 'bg-[#ffdad6] text-[#ba1a1a]' : 'bg-[#eceef0] text-[#505f76]'}`}>
                        {ckId}
                      </span>
                      <span className="font-['Inter'] text-base font-semibold text-[#191c1e]">{name}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-tighter ${hasRegression ? 'bg-[#ba1a1a] text-white' : 'bg-green-600 text-white'}`}>
                        {hasRegression ? 'Regression' : 'Improvement'}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={18} className="text-[#004ac6]" />
                    ) : (
                      <ChevronDown size={18} className="text-[#505f76] group-hover:text-[#004ac6] transition-all" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="p-6 space-y-4 bg-white border-t border-[#c3c6d7]">
                      {/* Checkpoint-level fallback row when no station data */}
                      {!hasStationData && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="font-['Inter'] text-xs font-semibold text-[#505f76] border-b border-[#c3c6d7]">
                                <th className="py-2 px-3">Level</th>
                                <th className="py-2 px-3">Before</th>
                                <th className="py-2 px-3">After</th>
                                <th className="py-2 px-3">Delta</th>
                              </tr>
                            </thead>
                            <tbody className="font-['Inter'] text-sm">
                              <tr className="hover:bg-[#eff6ff] transition-colors">
                                <td className="py-3 px-3 font-medium text-[#191c1e]">Checkpoint</td>
                                <td className="py-3 px-3 text-[#505f76]">{formatMin(op.baseline_p95)}</td>
                                <td className="py-3 px-3 font-medium">{formatMin(op.inferred_p95)}</td>
                                <td className={`py-3 px-3 font-medium ${hasRegression ? 'text-[#ba1a1a]' : 'text-green-700'}`}>
                                  <span className="flex items-center gap-1">
                                    {hasRegression ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                                    {hasRegression ? '+' : ''}{Math.abs(op.p95_delta).toFixed(1)}m
                                  </span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Station-level detail when available */}
                      {group.improvements.length > 0 && (
                        <div>
                          <h4 className="font-['Inter'] text-xs font-semibold text-green-700 uppercase tracking-wider mb-2">Station Improvements</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="font-['Inter'] text-xs font-semibold text-[#505f76] border-b border-[#c3c6d7]">
                                  <th className="py-2 px-3">Station ID</th>
                                  <th className="py-2 px-3">Before</th>
                                  <th className="py-2 px-3">After</th>
                                  <th className="py-2 px-3">Delta</th>
                                </tr>
                              </thead>
                              <tbody className="font-['Inter'] text-sm">
                                {group.improvements.map((st) => (
                                  <tr key={st.station_id} className="hover:bg-[#eff6ff] transition-colors">
                                    <td className="py-3 px-3 font-medium text-[#191c1e]">{st.station_id}</td>
                                    <td className="py-3 px-3 text-[#505f76]">{formatMin(st.baseline_p95)}</td>
                                    <td className="py-3 px-3 text-green-700 font-medium">{formatMin(st.inferred_p95)}</td>
                                    <td className="py-3 px-3 text-green-700 font-medium">
                                      <span className="flex items-center gap-1">
                                        <ArrowDown size={12} /> {Math.abs(st.p95_delta_min).toFixed(1)}m
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {group.regressions.length > 0 && (
                        <div>
                          <h4 className="font-['Inter'] text-xs font-semibold text-[#ba1a1a] uppercase tracking-wider mb-2">Station Regressions</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="font-['Inter'] text-xs font-semibold text-[#505f76] border-b border-[#c3c6d7]">
                                  <th className="py-2 px-3">Station ID</th>
                                  <th className="py-2 px-3">Before</th>
                                  <th className="py-2 px-3">After</th>
                                  <th className="py-2 px-3">Delta</th>
                                </tr>
                              </thead>
                              <tbody className="font-['Inter'] text-sm">
                                {group.regressions.map((st) => (
                                  <tr key={st.station_id} className="hover:bg-[#eff6ff] transition-colors">
                                    <td className="py-3 px-3 font-medium text-[#191c1e]">{st.station_id}</td>
                                    <td className="py-3 px-3 text-[#505f76]">{formatMin(st.baseline_p95)}</td>
                                    <td className="py-3 px-3 text-[#ba1a1a] font-medium">{formatMin(st.inferred_p95)}</td>
                                    <td className="py-3 px-3 text-[#ba1a1a] font-medium">
                                      <span className="flex items-center gap-1">
                                        <ArrowUp size={12} /> +{st.p95_delta_min.toFixed(1)}m
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Operational Changes for this checkpoint */}
                      {opsByCheckpoint[ckId] && opsByCheckpoint[ckId].length > 0 && (
                        <div className="bg-[#f2f4f6] border border-[#c3c6d7] rounded p-4">
                          <h4 className="font-['Inter'] text-xs font-semibold text-[#004ac6] uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Wrench size={14} />
                            Recommended Structural Changes
                          </h4>
                          <ul className="space-y-2">
                            {opsByCheckpoint[ckId].map((action, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#004ac6] shrink-0" />
                                <span className="font-['Inter'] text-sm text-[#434655]">{action}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Model used footer */}
      <p className="text-right text-xs text-[#737686] font-['Inter'] mt-2">
        Model: {insights.model_used} • File: {insights.comparison_file}
      </p>
    </main>
  );
}
