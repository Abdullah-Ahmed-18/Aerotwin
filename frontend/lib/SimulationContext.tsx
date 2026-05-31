'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export interface SimulationSummary {
  totalPassengers: number;
  completedPassengers: number;
  meanJourneyTime: number;
  p90JourneyTime: number;
  weightedKpiScore: number;
}

export interface SimulationCheckpoint {
  id: string;
  mqt: number;
  mqs: number;
  p90Wait: number;
  meanDwell: number;
  throughput: number;
  timeProfile: Array<{
    binLabel: string;
    count: number;
    mqt: number;
    mqs: number;
    p90Wait: number;
    throughput: number;
  }>;
}

export interface SimulationFlight {
  flightId: string;
  passengers: number;
  meanJourneyTime: number;
  worstCheckpoint: string;
  onTimeClearance: boolean;
  kpiVector: number[];
}

export interface SimulationResults {
  runId: string;
  status: string;
  summary: SimulationSummary;
  checkpoints: SimulationCheckpoint[];
  flights: SimulationFlight[];
}

interface SimulationState {
  currentRunId: string | null;
  runStatus: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  results: SimulationResults | null;
  error: string | null;
  progress: number; // 0-100
}

interface SimulationContextValue extends SimulationState {
  startRun: (desconfig: any, flights: any[], absconfigs?: any) => Promise<void>;
  pollStatus: () => Promise<void>;
  clearRun: () => void;
  viewReplay: (runId: string) => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

const API_BASE = 'http://localhost:5000';

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SimulationState>({
    currentRunId: null,
    runStatus: 'idle',
    results: null,
    error: null,
    progress: 0,
  });

  const router = useRouter();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const viewReplay = useCallback(async (runId: string) => {
    if (state.currentRunId !== runId) {
      try {
        const resultsRes = await fetch(`${API_BASE}/api/runs/${runId}/results`);
        const resultsData = await resultsRes.json();
        if (resultsRes.ok) {
          setState({
            currentRunId: runId,
            runStatus: 'completed',
            results: resultsData,
            error: null,
            progress: 100,
          });
        }
      } catch (err) {
        console.error('Failed to load results for replay:', err);
      }
    }
    router.push(`/dashboard`);
  }, [state.currentRunId, router]);

  const clearPoll = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Hydrate persisted completed run on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedRunId = localStorage.getItem('aerotwin:simRunId');
      const savedResults = localStorage.getItem('aerotwin:simResults');
      if (savedRunId && savedResults) {
        const parsed = JSON.parse(savedResults);
        setState({
          currentRunId: savedRunId,
          runStatus: 'completed',
          results: parsed,
          error: null,
          progress: 100,
        });
      }
    } catch (e) {
      console.error('Failed to hydrate simulation state:', e);
    }
    setHydrated(true);
  }, []);

  // Persist completed results
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      if (state.results && state.currentRunId && state.runStatus === 'completed') {
        localStorage.setItem('aerotwin:simRunId', state.currentRunId);
        localStorage.setItem('aerotwin:simResults', JSON.stringify(state.results));
      }
    } catch {}
  }, [state.results, state.currentRunId, state.runStatus, hydrated]);

  const startRun = useCallback(async (desconfig: any, flights: any[], absconfigs?: any) => {
    clearPoll();
    setState({
      currentRunId: null,
      runStatus: 'queued',
      results: null,
      error: null,
      progress: 5,
    });

    try {
      const response = await fetch(`${API_BASE}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desconfig, absconfigs, flights }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start simulation');
      }

      setState(prev => ({
        ...prev,
        currentRunId: data.runId,
        runStatus: 'running',
        progress: 10,
      }));

      // Start polling
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/api/runs/${data.runId}/status`);
          const statusData = await statusRes.json();

          if (!statusRes.ok) {
            setState(prev => ({ ...prev, runStatus: 'failed', error: statusData.error, progress: 0 }));
            clearPoll();
            return;
          }

          // Calculate pseudo-progress based on elapsed time (typical run ~2-5 min)
          const elapsedMin = (Date.now() - (statusData.startTime || Date.now())) / 60000;
          const pseudoProgress = Math.min(90, 10 + elapsedMin * 15);

          setState(prev => ({
            ...prev,
            runStatus: statusData.status,
            progress: statusData.status === 'completed' ? 100 : pseudoProgress,
          }));

          if (statusData.status === 'completed') {
            clearPoll();
            // Fetch results
            const resultsRes = await fetch(`${API_BASE}/api/runs/${data.runId}/results`);
            const resultsData = await resultsRes.json();
            if (resultsRes.ok) {
              setState(prev => ({ ...prev, results: resultsData, progress: 100 }));
            } else {
              setState(prev => ({ ...prev, error: resultsData.error, runStatus: 'failed', progress: 0 }));
            }
          } else if (statusData.status === 'failed') {
            clearPoll();
            setState(prev => ({ ...prev, error: statusData.error || 'Simulation failed', progress: 0 }));
          }
        } catch (err: any) {
          setState(prev => ({ ...prev, error: err.message, runStatus: 'failed', progress: 0 }));
          clearPoll();
        }
      }, 2000);
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message, runStatus: 'failed', progress: 0 }));
    }
  }, [clearPoll]);

  const pollStatus = useCallback(async () => {
    if (!state.currentRunId) return;
    try {
      const res = await fetch(`${API_BASE}/api/runs/${state.currentRunId}/status`);
      const data = await res.json();
      if (res.ok) {
        setState(prev => ({ ...prev, runStatus: data.status }));
      }
    } catch {}
  }, [state.currentRunId]);

  const clearRun = useCallback(() => {
    clearPoll();
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('aerotwin:simRunId');
        localStorage.removeItem('aerotwin:simResults');
      } catch {}
    }
    setState({
      currentRunId: null,
      runStatus: 'idle',
      results: null,
      error: null,
      progress: 0,
    });
  }, [clearPoll]);

  return (
    <SimulationContext.Provider value={{ ...state, startRun, pollStatus, clearRun, viewReplay }}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulation must be used within SimulationProvider');
  return ctx;
}
