'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface ReplayContextType {
  runId: string | null;
  playbackTime: number;
  isPlaying: boolean;
  speed: number;
  duration: number;
  isLoading: boolean;
  passengerCount: number;
  setUnityInstance: (instance: any) => void;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  setSpeed: (s: number) => void;
  loadReplayData: (runId: string) => Promise<void>;
  error: string | null;
}

const ReplayContext = createContext<ReplayContextType | null>(null);

export function ReplayProvider({ children }: { children: React.ReactNode }) {
  const [runId, setRunId] = useState<string | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [passengerCount, setPassengerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const unityInstanceRef = useRef<any>(null);
  const replayDataRef = useRef<any>(null);

  const setUnityInstance = useCallback((instance: any) => {
    unityInstanceRef.current = instance;
    // If we already have the replay data loaded, push it to Unity now
    if (instance && replayDataRef.current) {
      console.log("[ReplayContext] Pushing loaded replay data to new Unity instance");
      instance.SendMessage("Replay_System", "LoadReplay", JSON.stringify(replayDataRef.current));
    }
  }, []);

  const play = useCallback(() => {
    if (unityInstanceRef.current) {
      unityInstanceRef.current.SendMessage("Replay_System", "Play");
      setIsPlaying(true);
    }
  }, []);

  const pause = useCallback(() => {
    if (unityInstanceRef.current) {
      unityInstanceRef.current.SendMessage("Replay_System", "Pause");
      setIsPlaying(false);
    }
  }, []);

  const seek = useCallback((t: number) => {
    if (unityInstanceRef.current) {
      unityInstanceRef.current.SendMessage("Replay_System", "Seek", t.toString());
      setPlaybackTime(t);
    }
  }, []);

  const setSpeed = useCallback((s: number) => {
    if (unityInstanceRef.current) {
      unityInstanceRef.current.SendMessage("Replay_System", "SetSpeed", s.toString());
      setSpeedState(s);
    }
  }, []);

  // Sync state from Unity callback
  useEffect(() => {
    if (typeof window === 'undefined') return;

    (window as any).unityReplayCallback = (time: number, playing: boolean) => {
      setPlaybackTime(time);
      setIsPlaying(playing);

      // Dynamically calculate passenger count at this time if events are loaded
      if (replayDataRef.current && replayDataRef.current.events) {
        const events = replayDataRef.current.events;
        // Count passengers that have arrived but not yet exited
        const paxStates: Record<string, { arrived: boolean, exited: boolean }> = {};
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          if (ev.t > time) break; // Events are sorted by t ascending

          if (!paxStates[ev.passengerId]) {
            paxStates[ev.passengerId] = { arrived: false, exited: false };
          }
          if (ev.type === 'arrive') {
            paxStates[ev.passengerId].arrived = true;
          } else if (ev.type === 'exit') {
            paxStates[ev.passengerId].exited = true;
          }
        }

        let activeCount = 0;
        for (const pid in paxStates) {
          if (paxStates[pid].arrived && !paxStates[pid].exited) {
            activeCount++;
          }
        }
        setPassengerCount(activeCount);
      }
    };

    return () => {
      delete (window as any).unityReplayCallback;
    };
  }, []);

  const loadReplayData = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    setRunId(id);
    try {
      const res = await fetch(`http://localhost:5000/api/runs/${id}/replay`);
      if (!res.ok) {
        throw new Error(`Failed to fetch replay data: ${res.statusText}`);
      }
      const data = await res.json();
      replayDataRef.current = data;
      setDuration(data.durationSec || 0);

      // If Unity is already loaded, send the JSON
      if (unityInstanceRef.current) {
        console.log("[ReplayContext] Pushing loaded replay data to Unity");
        unityInstanceRef.current.SendMessage("Replay_System", "LoadReplay", JSON.stringify(data));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load replay data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <ReplayContext.Provider
      value={{
        runId,
        playbackTime,
        isPlaying,
        speed,
        duration,
        isLoading,
        passengerCount,
        setUnityInstance,
        play,
        pause,
        seek,
        setSpeed,
        loadReplayData,
        error
      }}
    >
      {children}
    </ReplayContext.Provider>
  );
}

export function useReplay() {
  const ctx = useContext(ReplayContext);
  if (!ctx) {
    throw new Error('useReplay must be used within a ReplayProvider');
  }
  return ctx;
}
