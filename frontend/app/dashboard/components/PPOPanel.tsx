'use client';

import { Settings, AlertCircle } from 'lucide-react';

export interface ProposedConfig {
  checkpoints?: any[];
  summary?: any;
  improvement?: number;
}

interface PPOPanelProps {
  proposed?: ProposedConfig | null;
}

export default function PPOPanel({ proposed }: PPOPanelProps) {
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
                Current Score
              </p>
              <p className="text-lg font-black text-slate-800">—</p>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                Proposed Score
              </p>
              <p className="text-lg font-black text-slate-800">—</p>
            </div>
          </div>
          <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100">
            <p className="text-[10px] text-indigo-700 font-medium">
              Improvement:{" "}
              {proposed.improvement !== undefined
                ? `${(proposed.improvement * 100).toFixed(1)}%`
                : '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
