'use client';

import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ChartData {
  name: string;
  value: number;
  color: string;
}

interface FlightPieChartProps {
  data: Record<string, number>;
  title?: string;
}

const statusColors: Record<string, string> = {
  active: '#10b981',
  scheduled: '#3b82f6',
  landed: '#64748b',
  diverted: '#f59e0b',
  cancelled: '#ef4444',
  default: '#6366f1',
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg">
        <p className="text-slate-700 text-xs font-medium">{payload[0].name}</p>
        <p className="text-slate-800 text-sm font-bold">{payload[0].value}</p>
      </div>
    );
  }
  return null;
};

export default function FlightPieChart({ data, title }: FlightPieChartProps) {
  const chartData: ChartData[] = Object.entries(data).map(([key, value]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value,
    color: statusColors[key] || statusColors.default,
  }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200 shadow-sm p-4">
      {title && (
        <h3 className="text-slate-700 text-xs font-bold uppercase tracking-wider mb-2">
          {title}
        </h3>
      )}
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={60}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        {chartData.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-slate-400 text-[10px] flex-1 truncate">{item.name}</span>
            <span className="text-slate-800 text-[10px] font-mono">{item.value}</span>
          </div>
        ))}
      </div>
      {/* Center Total */}
      <div className="text-center mt-1">
        <span className="text-slate-500 text-[10px]">Total: </span>
        <span className="text-slate-800 text-xs font-bold">{total}</span>
      </div>
    </div>
  );
}