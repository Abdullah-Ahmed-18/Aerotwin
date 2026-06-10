'use client';

import { Settings, AlertCircle, TrendingUp, FileCheck } from 'lucide-react';

export interface ProposedConfig {
  checkpoints?: any[];
  summary?: any;
  improvement?: number;
  comparison?: any;
  savedTo?: string;
  inferredAero?: any;
  actionNorm?: number;
}

interface PPOPanelProps {
  proposed?: ProposedConfig | null;
}

export default function PPOPanel({ proposed }: PPOPanelProps) {
  const comparison = proposed?.comparison;
  const baselineReward = comparison?.baseline_reward ?? comparison?.baseline?.reward ?? null;
  const inferredReward = comparison?.inferred_reward ?? comparison?.inferred?.reward ?? null;
  const rewardDelta = comparison?.reward_delta ?? (baselineReward !== null && inferredReward !== null ? inferredReward - baselineReward : null);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm p-4 flex-1 flex flex-col">
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <Settings size={14} className="text-indigo-500" />
        <h3 className="text-slate-700 text-xs font-bold uppercase tracking-wider">
          Current vs Proposed
        </h3>
      </div>

      {!proposed ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
          <AlertCircle size={24} className="opacity-40" />
          <p className="text-sm font-medium">Awaiting PPO data</p>
          <p className="text-[10px] text-slate-400 text-center max-w-xs">
            Proposed configuration recommendations will appear here once the optimization layer
            returns data.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                Baseline Reward
              </p>
              <p className="text-lg font-black text-slate-800">
                {baselineReward !== null ? baselineReward.toFixed(2) : '—'}
              </p>
            </div>
            <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-200">
              <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider">
                AI Reward
              </p>
              <p className="text-lg font-black text-indigo-700">
                {inferredReward !== null ? inferredReward.toFixed(2) : '—'}
              </p>
            </div>
          </div>

          {rewardDelta !== null && (
            <div className={`p-2 rounded-lg border flex items-center gap-2 ${
              rewardDelta >= 0
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <TrendingUp size={14} className={rewardDelta >= 0 ? 'text-green-600' : 'text-amber-600'} />
              <p className={`text-[10px] font-medium ${
                rewardDelta >= 0 ? 'text-green-700' : 'text-amber-700'
              }`}>
                {rewardDelta >= 0 ? '+' : ''}{rewardDelta.toFixed(2)} reward delta
                {baselineReward !== null && baselineReward !== 0
                  ? ` (${(rewardDelta / Math.abs(baselineReward) * 100).toFixed(1)}%)`
                  : ''}
              </p>
            </div>
          )}

          {proposed.savedTo && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <FileCheck size={12} />
              <span className="truncate">{proposed.savedTo.split('/').pop()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
