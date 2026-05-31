'use client';

import { useState, useEffect } from 'react';
import {
  Monitor,
  Maximize2,
  Plane,
} from 'lucide-react';
import { useSimulation } from '@/lib/SimulationContext';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import SimulationKPIPanel from './components/SimulationKPIPanel';
import ContentionChart from './components/ContentionChart';
import PPOPanel from './components/PPOPanel';
import { ReplayProvider, useReplay } from '@/lib/ReplayContext';
import UnityReplayLoader from '@/app/replay/UnityReplayLoader';
import ReplayTransportBar from '@/components/ReplayTransportBar';

function DashboardReplayPlayer({ runId }: { runId: string }) {
  const { loadReplayData, duration } = useReplay();

  useEffect(() => {
    if (runId) {
      loadReplayData(runId);
    }
  }, [runId, loadReplayData]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-950">
      {/* 3D Viewport container */}
      <div className="flex-1 relative min-h-0">
        <UnityReplayLoader />
      </div>

      {/* Control bar */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 shrink-0">
        <ReplayTransportBar />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const simulation = useSimulation();

  const showBottomPanel = !!simulation.results;

  return (
    <div className="flex-1 bg-[#F8FAFC] p-6 flex flex-col gap-4 overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4 shrink-0 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
            <Monitor size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-slate-800 font-bold text-lg tracking-wide">
              Simulator Dashboard
            </h1>
            <p className="text-slate-400 text-xs">Unity WebGL Simulation</p>
          </div>
        </div>

        {/* Global Search */}
        <div className="flex-1 max-w-xl">
          <SearchBar />
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/active-flights"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
          >
            <Plane size={14} />
            View Flights
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Unity WebGL Preview */}
        <div
          className={`flex-grow relative rounded-2xl overflow-hidden border border-slate-200 bg-white ${
            isFullscreen ? 'fixed inset-4 z-50' : ''
          }`}
        >
          {/* Unity Header */}
          <div className={`absolute top-0 left-0 right-0 h-12 z-10 flex items-center justify-between px-4 ${
            simulation.runStatus === 'completed' && simulation.results
              ? 'bg-gradient-to-b from-slate-950/95 to-transparent text-white'
              : 'bg-gradient-to-b from-white/90 to-transparent text-slate-700'
          }`}>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  simulation.runStatus === 'completed' && simulation.results
                    ? 'bg-blue-400 animate-pulse'
                    : 'bg-red-400'
                }`}
              />
              <span className={`text-xs font-medium ${
                simulation.runStatus === 'completed' && simulation.results ? 'text-slate-200' : 'text-slate-700'
              }`}>
                {simulation.runStatus === 'completed' && simulation.results
                  ? '3D Simulation Replay'
                  : 'Unity Not Running'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
              >
                <Maximize2 size={14} className={simulation.runStatus === 'completed' && simulation.results ? 'text-slate-200 hover:text-white' : 'text-slate-400 hover:text-slate-600'} />
              </button>
            </div>
          </div>

          {/* Unity WebGL Embed or Replay Player */}
          {simulation.runStatus === 'completed' && simulation.results ? (
            <ReplayProvider>
              <DashboardReplayPlayer runId={simulation.results.runId} />
            </ReplayProvider>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                <Monitor size={40} className="text-slate-600" />
              </div>
              <div className="text-center">
                <p className="text-slate-400 font-medium">Unity WebGL Not Running</p>
                <p className="text-slate-500 text-sm mt-1">
                  Start your Unity project to see the simulation here
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar — KPI Tier Panel */}
        <div className="w-96 flex flex-col bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-slate-700 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <Monitor size={14} className="text-blue-500" />
              Simulation KPIs
            </h3>
            <span
              className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                simulation.runStatus === 'completed'
                  ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                  : simulation.runStatus === 'running' || simulation.runStatus === 'queued'
                  ? 'text-blue-600 bg-blue-50 border-blue-100'
                  : simulation.runStatus === 'failed'
                  ? 'text-rose-600 bg-rose-50 border-rose-100'
                  : 'text-slate-500 bg-slate-50 border-slate-200'
              }`}
            >
              {simulation.runStatus}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <SimulationKPIPanel />
          </div>
        </div>
      </div>

      {/* Bottom Panel — Contention + PPO */}
      {showBottomPanel && (
        <div className="h-56 shrink-0 flex gap-4">
          <ContentionChart />
          <PPOPanel />
        </div>
      )}
    </div>
  );
}
