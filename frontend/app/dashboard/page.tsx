'use client';

import { useState, useEffect, useCallback } from 'react';
import { Monitor, Maximize2, Activity, Wifi, WifiOff, Plane, RefreshCw, ExternalLink, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Clock, Target, Zap, Gauge, Users, BarChart2 } from 'lucide-react';
import Link from 'next/link';
import FlightPieChart from '@/components/FlightPieChart';
import FlightGanttChart from '@/components/FlightGanttChart';
import PassengerLoadHeatmap from '@/components/PassengerLoadHeatmap';
import QueueWaitEstimator from '@/components/QueueWaitEstimator';
import AirlineAnalytics from '@/components/AirlineAnalytics';

interface FlightMeta {
  count: number;
  status_counts: Record<string, number>;
  arrivals_fetched: number;
  departures_fetched: number;
  opensky_enriched: number;
  opensky_aircraft_nearby: number;
  airport: string;
  airport_icao: string;
  peak_hour?: string;
  on_time_rate?: number;
}

interface CardItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  component: React.ReactNode;
  accentColor: string;
}

// Card data array for slider
const SIDEBAR_CARDS: CardItem[] = [
  {
    id: 'overview',
    title: 'Flight Overview',
    icon: <Plane size={14} className="text-blue-400" />,
    component: 'overview',
    accentColor: 'blue',
  },
  {
    id: 'status-chart',
    title: 'Status Distribution',
    icon: <Activity size={14} className="text-emerald-400" />,
    component: 'pieChart',
    accentColor: 'emerald',
  },
  {
    id: 'timeline',
    title: 'Flight Timeline',
    icon: <Clock size={14} className="text-purple-400" />,
    component: 'ganttChart',
    accentColor: 'purple',
  },
  {
    id: 'status-breakdown',
    title: 'Status Breakdown',
    icon: <TrendingUp size={14} className="text-cyan-400" />,
    component: 'statusBreakdown',
    accentColor: 'cyan',
  },
  {
    id: 'data-sources',
    title: 'Data Sources',
    icon: <Zap size={14} className="text-amber-400" />,
    component: 'dataSources',
    accentColor: 'amber',
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions',
    icon: <Gauge size={14} className="text-rose-400" />,
    component: 'quickActions',
    accentColor: 'rose',
  },
  {
    id: 'load-heatmap',
    title: 'Load Heatmap',
    icon: <Users size={14} className="text-violet-400" />,
    component: 'loadHeatmap',
    accentColor: 'violet',
  },
  {
    id: 'queue-estimator',
    title: 'Queue Wait',
    icon: <Clock size={14} className="text-teal-400" />,
    component: 'queueEstimator',
    accentColor: 'teal',
  },
  {
    id: 'airline-analytics',
    title: 'Airline Analytics',
    icon: <BarChart2 size={14} className="text-indigo-400" />,
    component: 'airlineAnalytics',
    accentColor: 'indigo',
  },
];

export default function DashboardPage() {
  const [unityUrl] = useState('http://localhost:8080');
  const [isUnityConnected, setIsUnityConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [flightMeta, setFlightMeta] = useState<FlightMeta | null>(null);
  const [flightList, setFlightList] = useState<any[]>([]);
  const [isLoadingFlights, setIsLoadingFlights] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  // Check if Unity WebGL is running
  const checkUnityConnection = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(unityUrl, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);
      setIsUnityConnected(response.ok);
    } catch {
      setIsUnityConnected(false);
    }
  }, [unityUrl]);

  useEffect(() => {
    checkUnityConnection();
    const interval = setInterval(checkUnityConnection, 10000);
    return () => clearInterval(interval);
  }, [checkUnityConnection]);

  const fetchFlightStats = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/fetch-active-flights');
      const data = await response.json();
      if (data.meta) {
        setFlightMeta(data.meta);
        setLastUpdated(new Date());
      }
      if (Array.isArray(data.flights)) {
        setFlightList(data.flights);
      }
    } catch (error) {
      console.error('Failed to fetch flight stats:', error);
    } finally {
      setIsLoadingFlights(false);
    }
  }, []);

  useEffect(() => {
    fetchFlightStats();
    const interval = setInterval(fetchFlightStats, 30000);
    return () => clearInterval(interval);
  }, [fetchFlightStats]);

  // Keyboard navigation for cards
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentCardIndex((prev) => (prev - 1 + SIDEBAR_CARDS.length) % SIDEBAR_CARDS.length);
      } else if (e.key === 'ArrowRight') {
        setCurrentCardIndex((prev) => (prev + 1) % SIDEBAR_CARDS.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return { bg: 'bg-emerald-500', text: 'text-emerald-400', label: 'Active' };
      case 'scheduled': return { bg: 'bg-blue-500', text: 'text-blue-400', label: 'Scheduled' };
      case 'landed': return { bg: 'bg-slate-500', text: 'text-slate-400', label: 'Landed' };
      case 'diverted': return { bg: 'bg-amber-500', text: 'text-amber-400', label: 'Diverted' };
      case 'cancelled': return { bg: 'bg-red-500', text: 'text-red-400', label: 'Cancelled' };
      default: return { bg: 'bg-slate-500', text: 'text-slate-400', label: status };
    }
  };

  const getUtilization = () => {
    if (!flightMeta) return 0;
    const active = flightMeta.status_counts?.active || 0;
    const total = flightMeta.count || 1;
    return Math.round((active / total) * 100);
  };

  const nextCard = useCallback(() => {
    setCurrentCardIndex((prev) => (prev + 1) % SIDEBAR_CARDS.length);
  }, []);

  const prevCard = useCallback(() => {
    setCurrentCardIndex((prev) => (prev - 1 + SIDEBAR_CARDS.length) % SIDEBAR_CARDS.length);
  }, []);

  // Render card content based on current card
  const renderCardContent = (card: CardItem) => {
    switch (card.component) {
      case 'overview':
        return (
          <div className="space-y-4">
            {/* Total Flights with glow */}
            <div className="relative p-4 bg-gradient-to-br from-blue-500/10 to-transparent rounded-xl border border-blue-500/20">
              <div className="absolute -inset-px bg-gradient-to-r from-blue-500/10 via-transparent to-transparent rounded-xl -z-10" />
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-sm">Total Flights</span>
                <div className="flex items-center gap-2">
                  <Plane size={14} className="text-blue-400" />
                  <span className="text-white text-2xl font-bold">{flightMeta?.count || 0}</span>
                </div>
              </div>
            </div>

            {/* Airport Info */}
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2">
                <Target size={14} className="text-emerald-400" />
                <span className="text-slate-400 text-xs">Airport</span>
              </div>
              <span className="text-white text-sm font-mono font-bold tracking-wider">{flightMeta?.airport_icao || 'N/A'}</span>
            </div>

            {/* Utilization Bar */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs flex items-center gap-1.5">
                  <Gauge size={12} className="text-emerald-400" /> Utilization
                </span>
                <span className="text-emerald-400 text-sm font-bold">{getUtilization()}%</span>
              </div>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-500 relative"
                  style={{ width: `${getUtilization()}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>
            </div>

            {/* Mini Stats Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <p className="text-slate-500 text-[10px]">Active</p>
                <p className="text-emerald-400 text-lg font-bold">{flightMeta?.status_counts?.active || 0}</p>
              </div>
              <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <p className="text-slate-500 text-[10px]">Scheduled</p>
                <p className="text-blue-400 text-lg font-bold">{flightMeta?.status_counts?.scheduled || 0}</p>
              </div>
            </div>
          </div>
        );
      case 'pieChart':
        return flightMeta?.status_counts ? (
          <FlightPieChart data={flightMeta.status_counts} title="" />
        ) : (
          <p className="text-slate-500 text-sm">No data available</p>
        );
      case 'ganttChart':
        return flightMeta ? (
          <FlightGanttChart
            arrivalsCount={flightMeta.arrivals_fetched}
            departuresCount={flightMeta.departures_fetched}
            title=""
          />
        ) : (
          <p className="text-slate-500 text-sm">No data available</p>
        );
      case 'statusBreakdown':
        return flightMeta?.status_counts ? (
          <div className="space-y-3">
            {Object.entries(flightMeta.status_counts).map(([status, count]) => {
              const colors = getStatusColor(status);
              const percentage = flightMeta.count > 0 ? Math.round((count / flightMeta.count) * 100) : 0;
              return (
                <div key={status} className="group">
                  <div className="flex items-center gap-3 mb-1.5">
                    <div className={`w-3 h-3 rounded-full ${colors.bg} shadow-lg`} />
                    <span className="text-slate-400 text-xs flex-1 font-medium">{colors.label}</span>
                    <span className="text-white text-sm font-mono font-bold">{count}</span>
                    <span className="text-slate-500 text-xs font-mono">{percentage}%</span>
                  </div>
                  <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden ml-6">
                    <div
                      className={`h-full ${colors.bg} rounded-full transition-all duration-500 group-hover:shadow-lg`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <Activity size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No status data</p>
          </div>
        );
      case 'dataSources':
        return flightMeta ? (
          <div className="space-y-3">
            {/* OpenSky Matched */}
            <div className="group p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:border-emerald-500/30 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Wifi size={14} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-slate-300 text-xs font-medium">OpenSky Matched</p>
                    <p className="text-slate-500 text-[10px]">ADS-B enriched</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-emerald-400 text-lg font-bold font-mono">{flightMeta.opensky_enriched}</span>
                  <p className="text-slate-600 text-[10px]">flights</p>
                </div>
              </div>
            </div>

            {/* Aircraft Nearby */}
            <div className="group p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 hover:border-blue-500/30 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Plane size={14} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-slate-300 text-xs font-medium">Aircraft Nearby</p>
                    <p className="text-slate-500 text-[10px]">OpenSky network</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-blue-400 text-lg font-bold font-mono">{flightMeta.opensky_aircraft_nearby}</span>
                  <p className="text-slate-600 text-[10px]">detected</p>
                </div>
              </div>
            </div>

            {/* Arrivals & Departures */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-lg border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown size={12} className="text-emerald-400" />
                  <span className="text-slate-400 text-[10px]">Arrivals</span>
                </div>
                <span className="text-white text-xl font-bold font-mono">{flightMeta.arrivals_fetched}</span>
              </div>
              <div className="p-3 bg-gradient-to-br from-blue-500/10 to-transparent rounded-lg border border-blue-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={12} className="text-blue-400" />
                  <span className="text-slate-400 text-[10px]">Departures</span>
                </div>
                <span className="text-white text-xl font-bold font-mono">{flightMeta.departures_fetched}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <WifiOff size={32} className="mb-2 opacity-50" />
            <p className="text-sm">Unable to load data sources</p>
          </div>
        );
      case 'quickActions':
        return (
          <div className="space-y-4">
            {/* Action Buttons Grid */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/" className="group relative p-4 bg-gradient-to-br from-slate-800 to-slate-800/50 hover:from-blue-600/20 hover:to-slate-800 rounded-xl border border-slate-700/50 hover:border-blue-500/50 transition-all duration-300 text-left overflow-hidden">
                <div className="absolute -inset-px bg-gradient-to-r from-blue-600/0 via-blue-500/0 to-blue-600/0 group-hover:via-blue-500/30 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Plane size={18} className="text-blue-400 group-hover:text-blue-300" />
                </div>
                <p className="text-slate-300 text-sm font-bold group-hover:text-white transition-colors">Config</p>
                <p className="text-slate-500 text-xs group-hover:text-slate-400 transition-colors">Flow Setup</p>
              </Link>
              <Link href="/active-flights" className="group relative p-4 bg-gradient-to-br from-slate-800 to-slate-800/50 hover:from-emerald-600/20 hover:to-slate-800 rounded-xl border border-slate-700/50 hover:border-emerald-500/50 transition-all duration-300 text-left overflow-hidden">
                <div className="absolute -inset-px bg-gradient-to-r from-emerald-600/0 via-emerald-500/0 to-emerald-600/0 group-hover:via-emerald-500/30 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Activity size={18} className="text-emerald-400 group-hover:text-emerald-300" />
                </div>
                <p className="text-slate-300 text-sm font-bold group-hover:text-white transition-colors">Flights</p>
                <p className="text-slate-500 text-xs group-hover:text-slate-400 transition-colors">View All</p>
              </Link>
              <button onClick={fetchFlightStats} className="group relative p-4 bg-gradient-to-br from-slate-800 to-slate-800/50 hover:from-purple-600/20 hover:to-slate-800 rounded-xl border border-slate-700/50 hover:border-purple-500/50 transition-all duration-300 text-left overflow-hidden">
                <div className="absolute -inset-px bg-gradient-to-r from-purple-600/0 via-purple-500/0 to-purple-600/0 group-hover:via-purple-500/30 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <RefreshCw size={18} className="text-purple-400 group-hover:text-purple-300 group-hover:animate-spin" />
                </div>
                <p className="text-slate-300 text-sm font-bold group-hover:text-white transition-colors">Refresh</p>
                <p className="text-slate-500 text-xs group-hover:text-slate-400 transition-colors">Flight Data</p>
              </button>
              <button onClick={() => setIsFullscreen(!isFullscreen)} className="group relative p-4 bg-gradient-to-br from-slate-800 to-slate-800/50 hover:from-amber-600/20 hover:to-slate-800 rounded-xl border border-slate-700/50 hover:border-amber-500/50 transition-all duration-300 text-left overflow-hidden">
                <div className="absolute -inset-px bg-gradient-to-r from-amber-600/0 via-amber-500/0 to-amber-600/0 group-hover:via-amber-500/30 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Maximize2 size={18} className="text-amber-400 group-hover:text-amber-300" />
                </div>
                <p className="text-slate-300 text-sm font-bold group-hover:text-white transition-colors">Fullscreen</p>
                <p className="text-slate-500 text-xs group-hover:text-slate-400 transition-colors">Unity View</p>
              </button>
            </div>
            {/* Last Updated */}
            {lastUpdated && (
              <div className="flex items-center justify-center gap-2 py-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <Clock size={12} className="text-slate-500" />
                <p className="text-slate-500 text-[10px]">
                  Last updated: <span className="text-slate-400">{lastUpdated.toLocaleTimeString()}</span>
                </p>
              </div>
            )}
          </div>
        );
      case 'loadHeatmap':
        return <PassengerLoadHeatmap flights={flightList} />;
      case 'queueEstimator':
        return <QueueWaitEstimator flights={flightList} />;
      case 'airlineAnalytics':
        return <AirlineAnalytics flights={flightList} />;
      default:
        return <p className="text-slate-500 text-sm">Unknown card</p>;
    }
  };

  return (
    <div className="flex-1 bg-slate-950 p-6 flex flex-col gap-4 overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
            <Monitor size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg tracking-wide">Simulator Dashboard</h1>
            <p className="text-slate-400 text-xs">Unity WebGL Simulation</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${isUnityConnected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            {isUnityConnected ? <><Wifi size={14} className="text-emerald-400" /><span className="text-emerald-400 text-xs font-bold">UNITY CONNECTED</span></> : <><WifiOff size={14} className="text-red-400" /><span className="text-red-400 text-xs font-bold">UNITY OFFLINE</span></>}
          </div>
          <Link href="/active-flights" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2">
            <Plane size={14} />View Flights
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Unity WebGL Preview */}
        <div className={`flex-1 relative rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-900 ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
          {/* Unity Header */}
          <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-slate-900/90 to-transparent z-10 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isUnityConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></div>
              <span className="text-slate-300 text-xs font-medium">{isUnityConnected ? 'Unity WebGL Running' : 'Unity Not Running'}</span>
            </div>
            <div className="flex items-center gap-2">
              <a href={unityUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-white/10 rounded-md transition-colors">
                <ExternalLink size={14} className="text-slate-400" />
              </a>
              <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 hover:bg-white/10 rounded-md transition-colors">
                <Maximize2 size={14} className="text-slate-400" />
              </button>
            </div>
          </div>

          {/* Unity WebGL Embed */}
          {isUnityConnected ? (
            <iframe src={unityUrl} className="w-full h-full" allow="fullscreen" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                <Monitor size={40} className="text-slate-600" />
              </div>
              <div className="text-center">
                <p className="text-slate-400 font-medium">Unity WebGL Not Running</p>
                <p className="text-slate-500 text-sm mt-1">Start your Unity project to see the simulation here</p>
              </div>
              <div className="mt-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <p className="text-slate-400 text-xs font-mono text-center">
                  Unity WebGL URL: {unityUrl}
                </p>
              </div>
            </div>
          )}

          {/* Bottom Stats Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-900/90 to-transparent z-10 flex items-end justify-center pb-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Activity size={12} />
                <span>Unity WebGL</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <span>Port: 8080</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Card Slider */}
        <div className="w-80 flex flex-col">
          {/* Navigation Tabs */}
          <div className="relative mb-3">
            {/* Left scroll arrow */}
            <button
              onClick={() => {
                const el = document.getElementById('dash-tab-scroll');
                if (el) el.scrollBy({ left: -120, behavior: 'smooth' });
              }}
              className="absolute left-0 top-0 bottom-0 z-10 flex items-center justify-center w-7 bg-gradient-to-r from-slate-950 via-slate-950/90 to-transparent hover:from-slate-800 transition-colors"
              aria-label="Scroll tabs left"
            >
              <ChevronLeft size={14} className="text-slate-400" />
            </button>

            {/* Scrollbar-on-top: flip outer div so scrollbar appears above tabs */}
            <div
              id="dash-tab-scroll"
              className="overflow-x-auto scroll-smooth mx-7"
              style={{
                transform: 'rotateX(180deg)',
                scrollbarWidth: 'thin',
                scrollbarColor: '#475569 transparent',
              }}
            >
              {/* Counter-flip inner row so tabs read normally */}
              <div className="flex gap-2 pt-2" style={{ transform: 'rotateX(180deg)' }}>
              {SIDEBAR_CARDS.map((card, index) => {
                const accentColors: Record<string, string> = {
                  blue:   'bg-blue-600 hover:bg-blue-500 text-white',
                  emerald:'bg-emerald-600 hover:bg-emerald-500 text-white',
                  purple: 'bg-purple-600 hover:bg-purple-500 text-white',
                  cyan:   'bg-cyan-600 hover:bg-cyan-500 text-white',
                  amber:  'bg-amber-600 hover:bg-amber-500 text-white',
                  rose:   'bg-rose-600 hover:bg-rose-500 text-white',
                  violet: 'bg-violet-600 hover:bg-violet-500 text-white',
                  teal:   'bg-teal-600 hover:bg-teal-500 text-white',
                  indigo: 'bg-indigo-600 hover:bg-indigo-500 text-white',
                };
                return (
                  <button
                    key={card.id}
                    id={`dash-tab-${index}`}
                    onClick={() => {
                      setCurrentCardIndex(index);
                      document.getElementById(`dash-tab-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                      currentCardIndex === index
                        ? accentColors[card.accentColor] || 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                    }`}
                  >
                    {card.icon}
                    <span>{card.title}</span>
                  </button>
                );
              })}
              </div>
            </div>

            {/* Right scroll arrow */}
            <button
              onClick={() => {
                const el = document.getElementById('dash-tab-scroll');
                if (el) el.scrollBy({ left: 120, behavior: 'smooth' });
              }}
              className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center w-7 bg-gradient-to-l from-slate-950 via-slate-950/90 to-transparent hover:from-slate-800 transition-colors"
              aria-label="Scroll tabs right"
            >
              <ChevronRight size={14} className="text-slate-400" />
            </button>
          </div>

          {/* Dots Indicator */}
          <div className="flex items-center justify-center gap-2 mb-4">
            {SIDEBAR_CARDS.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentCardIndex(index)}
                className={`transition-all duration-300 ${
                  currentCardIndex === index
                    ? 'w-6 h-2 bg-blue-500 rounded-full shadow-lg shadow-blue-500/50'
                    : 'w-2 h-2 bg-slate-600 rounded-full hover:bg-slate-500'
                }`}
                aria-label={`Go to card ${index + 1}`}
              />
            ))}
          </div>

          {/* Card Display Area */}
          <div className="flex-1 relative">
            {/* Current Card */}
            <div
              className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4 transition-all duration-300 absolute inset-0"
              key={currentCardIndex}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-300 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  {SIDEBAR_CARDS[currentCardIndex].icon}
                  {SIDEBAR_CARDS[currentCardIndex].title}
                </h3>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500 text-[10px]">
                    {currentCardIndex + 1}/{SIDEBAR_CARDS.length}
                  </span>
                </div>
              </div>

              {/* Loading State */}
              {isLoadingFlights ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw size={24} className="text-slate-500 animate-spin" />
                </div>
              ) : (
                /* Card Content */
                <div className="h-[calc(100%-2rem)] overflow-y-auto scrollbar-hide">
                  {renderCardContent(SIDEBAR_CARDS[currentCardIndex])}
                </div>
              )}
            </div>

            {/* Navigation Arrows */}
            <button
              onClick={prevCard}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 w-8 h-8 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center text-slate-300 hover:text-white transition-all z-10 shadow-lg"
              aria-label="Previous card"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={nextCard}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 w-8 h-8 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center text-slate-300 hover:text-white transition-all z-10 shadow-lg"
              aria-label="Next card"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
