'use client';

import { useState } from 'react';
import { useSimulation } from '@/lib/SimulationContext';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Target,
  Plane,
  Play,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import TierSummary from './TierSummary';
import TierCheckpoints from './TierCheckpoints';
import TierFlights from './TierFlights';

type Tier = 'summary' | 'checkpoints' | 'flights';

const TIERS: { id: Tier; label: string; icon: LucideIcon }[] = [
  { id: 'summary', label: 'Summary', icon: Target },
  { id: 'checkpoints', label: 'Checkpoints', icon: Activity },
  { id: 'flights', label: 'Flights', icon: Plane },
];

export default function SimulationKPIPanel() {
  const simulation = useSimulation();
  const router = useRouter();
  const [activeTier, setActiveTier] = useState<Tier>('summary');

  const renderContent = () => {
    switch (activeTier) {
      case 'summary':
        return <TierSummary />;
      case 'checkpoints':
        return <TierCheckpoints />;
      case 'flights':
        return <TierFlights />;
      default:
        return null;
    }
  };

  // Empty state
  if (!simulation.results && simulation.runStatus === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 px-4">
        <Play size={32} className="opacity-30" />
        <p className="text-sm font-medium">No simulation results yet</p>
        <p className="text-[10px] text-slate-400 text-center">
          Run a simulation to see KPIs, checkpoint breakdowns, and per-flight analysis.
        </p>
        <button
          onClick={() => router.push('/active-flights')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Plane size={10} />
          Run Simulation
        </button>
      </div>
    );
  }

  // Error state
  if (simulation.runStatus === 'failed' || simulation.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 px-4">
        <AlertCircle size={32} className="text-rose-400 opacity-60" />
        <p className="text-sm font-medium text-rose-600">Simulation failed</p>
        <p className="text-[10px] text-slate-400 text-center max-w-[200px]">
          {simulation.error || 'An unknown error occurred during the simulation.'}
        </p>
        <button
          onClick={simulation.clearRun}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors flex items-center gap-1.5"
        >
          <RefreshCw size={10} />
          Dismiss
        </button>
      </div>
    );
  }

  // Running state
  if (simulation.runStatus === 'running' || simulation.runStatus === 'queued') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 px-4">
        <RefreshCw size={28} className="text-blue-500 animate-spin" />
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-slate-700">Simulation Running</p>
          <div className="w-48 h-2 bg-slate-200 rounded-full overflow-hidden mx-auto">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${simulation.progress}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400">{simulation.progress}% complete</p>
        </div>
      </div>
    );
  }

  // Completed state with tier nav
  return (
    <div className="flex flex-col h-full">
      {/* Tier Navigation */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-3 shrink-0">
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          const active = activeTier === tier.id;
          return (
            <button
              key={tier.id}
              onClick={() => setActiveTier(tier.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                active
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <Icon size={12} />
              {tier.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
        {renderContent()}
      </div>

      {/* Run footer */}
      <div className="mt-3 pt-2 border-t border-slate-200 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-emerald-500" />
          <span className="text-[9px] text-slate-500 font-mono">
            {simulation.currentRunId?.slice(0, 8)}
          </span>
        </div>
        <button
          onClick={simulation.clearRun}
          className="text-[9px] font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-wider"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
