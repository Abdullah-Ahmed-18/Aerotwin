'use client';

import { useMemo } from 'react';
import { Plane, ArrowDown, ArrowUp } from 'lucide-react';

interface GanttBar {
  id: string;
  label: string;
  start: number;
  end: number;
  type: 'arrival' | 'departure';
}

interface FlightGanttChartProps {
  arrivalsCount: number;
  departuresCount: number;
  title?: string;
}

// Generate simulated flight timeline data
// eslint-disable-next-line react-hooks/purity
const generateGanttData = (arrivals: number, departures: number): GanttBar[] => {
  const bars: GanttBar[] = [];
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  // Generate arrival bars
  const arrivalTimes = [0.1, 0.35, 0.55, 0.75, 0.9];
  for (let i = 0; i < Math.min(arrivals, 5); i++) {
    const startOffset = arrivalTimes[i] * hourMs * 2;
    bars.push({
      id: `arr-${i}`,
      label: `ARR ${String(100 + i).padStart(3, '0')}`,
      start: now - hourMs + startOffset,
      end: now + (Math.random() * 0.5 + 0.2) * hourMs,
      type: 'arrival',
    });
  }

  // Generate departure bars
  const departureTimes = [0.2, 0.45, 0.65, 0.85];
  for (let i = 0; i < Math.min(departures, 4); i++) {
    const startOffset = departureTimes[i] * hourMs * 2;
    bars.push({
      id: `dep-${i}`,
      label: `DEP ${String(200 + i).padStart(3, '0')}`,
      start: now + startOffset,
      end: now + startOffset + (Math.random() * 0.5 + 0.5) * hourMs,
      type: 'departure',
    });
  }

  return bars;
};

export default function FlightGanttChart({ arrivalsCount, departuresCount, title }: FlightGanttChartProps) {
  // eslint-disable-next-line react-hooks/purity
  const { ganttData, now, startTime, endTime } = useMemo(() => {
    const data = generateGanttData(arrivalsCount, departuresCount);
    const n = Date.now();
    const hourMs = 60 * 60 * 1000;
    return {
      ganttData: data,
      now: n,
      startTime: n - 2 * hourMs,
      endTime: n + 2 * hourMs,
    };
  }, [arrivalsCount, departuresCount]);

  const getBarPosition = (timestamp: number) => {
    const totalRange = endTime - startTime;
    return ((timestamp - startTime) / totalRange) * 100;
  };

  const getBarWidth = (start: number, end: number) => {
    const totalRange = endTime - startTime;
    return ((end - start) / totalRange) * 100;
  };

  const getCurrentTimePosition = () => {
    return getBarPosition(now);
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm p-4">
      {title && (
        <h3 className="text-slate-700 text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
          <Plane size={14} className="text-blue-400" />
          {title}
        </h3>
      )}

      {/* Time Labels */}
      <div className="flex justify-between mb-2">
        <span className="text-slate-500 text-[10px] font-mono">-2h</span>
        <span className="text-slate-400 text-[10px] font-mono">NOW</span>
        <span className="text-slate-500 text-[10px] font-mono">+2h</span>
      </div>

      {/* Gantt Bars */}
      <div className="relative h-32 bg-slate-50 rounded-lg overflow-hidden">
        {/* Current Time Indicator */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20"
          style={{ left: `${getCurrentTimePosition()}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-amber-400 rounded-full" />
        </div>

        {/* Timeline Grid */}
        <div className="absolute inset-0 flex flex-col">
          <div className="flex-1 border-b border-slate-200 relative">
            {/* Grid lines */}
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-slate-200/70"
                style={{ left: `${(i + 1) * 20}%` }}
              />
            ))}
          </div>
        </div>

        {/* Arrivals Section */}
        <div className="absolute left-2 top-3 z-10">
          <ArrowDown size={10} className="text-emerald-400" />
        </div>
        <div className="absolute top-4 left-0 right-0 h-10 flex items-center px-2">
          {ganttData
            .filter((bar) => bar.type === 'arrival')
            .map((bar, index) => (
              <div
                key={bar.id}
                className="absolute h-6 bg-emerald-500/80 rounded border border-emerald-400/50 flex items-center px-1.5 cursor-pointer hover:bg-emerald-500 transition-colors group"
                style={{
                  left: `${getBarPosition(bar.start)}%`,
                  width: `${getBarWidth(bar.start, bar.end)}%`,
                  top: `${index * 12}px`,
                }}
              >
                <span className="text-slate-800 text-[8px] font-mono truncate group-hover:overflow-visible">
                  {bar.label}
                </span>
              </div>
            ))}
        </div>

        {/* Departures Section */}
        <div className="absolute left-2 top-1/2 z-10">
          <ArrowUp size={10} className="text-blue-400" />
        </div>
        <div className="absolute top-1/2 left-0 right-0 h-10 flex items-center px-2">
          {ganttData
            .filter((bar) => bar.type === 'departure')
            .map((bar, index) => (
              <div
                key={bar.id}
                className="absolute h-6 bg-blue-500/80 rounded border border-blue-400/50 flex items-center px-1.5 cursor-pointer hover:bg-blue-500 transition-colors group"
                style={{
                  left: `${getBarPosition(bar.start)}%`,
                  width: `${getBarWidth(bar.start, bar.end)}%`,
                  top: `${index * 12}px`,
                }}
              >
                <span className="text-slate-800 text-[8px] font-mono truncate group-hover:overflow-visible">
                  {bar.label}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-emerald-500/80 rounded border border-emerald-400/50" />
          <span className="text-slate-400 text-[10px]">Arrivals ({arrivalsCount})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-blue-500/80 rounded border border-blue-400/50" />
          <span className="text-slate-400 text-[10px]">Departures ({departuresCount})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-3 bg-amber-400" />
          <span className="text-slate-400 text-[10px]">Now</span>
        </div>
      </div>
    </div>
  );
}