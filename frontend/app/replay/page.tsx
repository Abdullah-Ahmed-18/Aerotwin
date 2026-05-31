'use client';

import React, { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ReplayProvider, useReplay } from '@/lib/ReplayContext';
import UnityReplayLoader from './UnityReplayLoader';
import ReplayTransportBar from '@/components/ReplayTransportBar';
import {
  ArrowLeft, Users, Activity
} from 'lucide-react';

function ReplayPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const runId = searchParams.get('runId');
  const {
    duration,
    isLoading,
    passengerCount,
    loadReplayData,
    error
  } = useReplay();

  useEffect(() => {
    if (runId) {
      loadReplayData(runId);
    } else {
      router.push('/dashboard');
    }
  }, [runId, loadReplayData, router]);

  if (isLoading && !duration) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-white min-h-screen">
        <Activity className="w-10 h-10 text-blue-500 animate-pulse mb-4" />
        <p className="text-slate-400 text-sm font-bold tracking-wide animate-pulse">
          Fetching Replay Event Stream...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-white min-h-screen p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 text-center space-y-4 shadow-xl">
          <h2 className="text-rose-500 text-lg font-bold">Failed to load replay</h2>
          <p className="text-slate-400 text-sm">{error}</p>
          <button
            onClick={() => router.push('/simulation')}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition-colors"
          >
            Back to Results
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden select-none">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/simulation')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={18} className="text-slate-400 hover:text-white" />
          </button>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-white">3D Replay Console</h1>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
              Run ID: {runId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 bg-slate-800 border border-slate-700/50 px-2.5 py-1.5 rounded-full">
            <Users size={12} className="text-blue-400" />
            <span>{passengerCount} passengers in terminal</span>
          </div>
          <span className="text-[10px] font-black bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-full uppercase tracking-widest">
            Replay Mode
          </span>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 relative bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950 p-6 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-5xl aspect-video rounded-xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-950">
          <UnityReplayLoader />
        </div>
      </main>

      {/* Replay Control Bar */}
      <footer className="border-t border-slate-800 bg-slate-900/80 backdrop-blur px-8 py-4">
        <div className="max-w-5xl mx-auto">
          <ReplayTransportBar />
        </div>
      </footer>
    </div>
  );
}

export default function ReplayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-white">
          <Activity className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      }
    >
      <ReplayProvider>
        <ReplayPageContent />
      </ReplayProvider>
    </Suspense>
  );
}
