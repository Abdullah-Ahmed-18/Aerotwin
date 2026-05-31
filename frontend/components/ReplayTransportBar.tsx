'use client';

import React from 'react';
import { useReplay } from '@/lib/ReplayContext';
import { formatSeconds } from '@/lib/formatSeconds';
import { Play, Pause, RotateCcw, Clock } from 'lucide-react';

export default function ReplayTransportBar() {
  const {
    playbackTime,
    isPlaying,
    speed,
    duration,
    play,
    pause,
    seek,
    setSpeed
  } = useReplay();

  const speeds = [1, 2, 5, 10, 30, 60];

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(parseFloat(e.target.value));
  };

  const handleRestart = () => {
    seek(0);
    pause();
  };

  return (
    <div className="space-y-3">
      {/* Timeline slider */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono text-slate-400 font-medium w-10 text-right">
          {formatSeconds(playbackTime)}
        </span>
        <div className="flex-1 relative group py-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={playbackTime}
            onChange={handleTimelineChange}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none focus:ring-0 group-hover:bg-slate-700 transition-colors"
            style={{
              background: `linear-gradient(to right, rgb(59, 130, 246) 0%, rgb(59, 130, 246) ${
                duration ? (playbackTime / duration) * 100 : 0
              }%, rgb(30, 41, 59) ${
                duration ? (playbackTime / duration) * 100 : 0
              }%, rgb(30, 41, 59) 100%)`
            }}
          />
        </div>
        <span className="text-[10px] font-mono text-slate-400 font-medium w-10 text-left">
          {formatSeconds(duration)}
        </span>
      </div>

      {/* Buttons row */}
      <div className="flex items-center justify-between">
        {/* Playback Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRestart}
            title="Restart"
            className="p-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700/50 rounded text-slate-400 hover:text-white transition-colors"
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={isPlaying ? pause : play}
            title={isPlaying ? 'Pause' : 'Play'}
            className="p-2 bg-blue-600 hover:bg-blue-550 rounded text-white transition-all shadow-md shadow-blue-500/10 active:scale-95 flex items-center justify-center"
          >
            {isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
          </button>
        </div>

        {/* Playback speed selector */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800/80 p-0.5 rounded">
          {speeds.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-1.5 py-0.5 text-[8px] font-black rounded uppercase tracking-wider transition-all ${
                speed === s
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-350'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Right speed display */}
        <div className="flex items-center gap-1.5 text-slate-500 text-[8px] font-black font-mono tracking-wider uppercase">
          <Clock size={10} className="text-slate-650" />
          <span>{speed}x</span>
        </div>
      </div>
    </div>
  );
}
