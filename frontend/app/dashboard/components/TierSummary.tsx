'use client';

import { useSimulation } from '@/lib/SimulationContext';
import { formatSeconds } from '@/lib/formatSeconds';
import { Users, Clock, Gauge, Target, CheckCircle2, TrendingUp } from 'lucide-react';

export default function TierSummary() {
  const simulation = useSimulation();
  const summary = simulation.results?.summary;

  if (!summary) return null;

  const completionPct = summary.totalPassengers > 0
    ? Math.round((summary.completedPassengers / summary.totalPassengers) * 100)
    : 0;

  const kpiScore = Math.round(summary.weightedKpiScore * 100);

  const statCards = [
    {
      label: 'Total Passengers',
      value: summary.totalPassengers.toLocaleString(),
      sub: `${summary.completedPassengers} completed (${completionPct}%)`,
      icon: Users,
      color: 'blue',
    },
    {
      label: 'Mean Journey',
      value: formatSeconds(summary.meanJourneyTime),
      sub: 'Average time across all pax',
      icon: Clock,
      color: 'emerald',
    },
    {
      label: 'P90 Journey',
      value: formatSeconds(summary.p90JourneyTime),
      sub: '90th percentile journey time',
      icon: TrendingUp,
      color: 'indigo',
    },
    {
      label: 'KPI Score',
      value: `${kpiScore}`,
      sub: 'Weighted score 0-100',
      icon: Gauge,
      color: 'amber',
    },
  ];

  return (
    <div className="space-y-3">
      {/* Headline Score */}
      <div className="p-4 bg-gradient-to-br from-blue-500/10 to-transparent rounded-xl border border-blue-500/20">
        <div className="flex items-center gap-2 mb-1">
          <Target size={14} className="text-blue-500" />
          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Run Score</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black text-slate-800">{kpiScore}</span>
          <span className="text-sm text-slate-500 font-medium">/ 100</span>
        </div>
        <div className="mt-2 w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${kpiScore}%` }}
          />
        </div>
      </div>

      {/* Stat Grid */}
      <div className="grid grid-cols-2 gap-2">
        {statCards.map((card) => {
          const Icon = card.icon;
          const colorMap: Record<string, string> = {
            blue: 'text-blue-600 bg-blue-50 border-blue-100',
            emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
            indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
            amber: 'text-amber-600 bg-amber-50 border-amber-100',
          };
          return (
            <div key={card.label} className={`p-3 rounded-lg border ${colorMap[card.color]}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} className="opacity-70" />
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{card.label}</span>
              </div>
              <p className="text-xl font-black text-slate-800">{card.value}</p>
              <p className="text-[9px] opacity-60 mt-0.5 leading-tight">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Completion Progress */}
      <div className="p-3 bg-white rounded-lg border border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-emerald-500" />
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Completion Rate</span>
          </div>
          <span className="text-slate-800 text-sm font-bold">{completionPct}%</span>
        </div>
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-slate-400">{summary.completedPassengers} completed</span>
          <span className="text-[9px] text-slate-400">{summary.totalPassengers} total</span>
        </div>
      </div>
    </div>
  );
}
