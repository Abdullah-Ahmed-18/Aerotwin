'use client';

import { useState, useEffect, useCallback } from 'react';
import { Monitor, Maximize2, Activity, Radio, Wifi, WifiOff, Plane, ArrowUpDown, RefreshCw, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface FlightMeta {
  count: number;
  status_counts: Record<string, number>;
  arrivals_fetched: number;
  departures_fetched: number;
  opensky_enriched: number;
  opensky_aircraft_nearby: number;
  airport: string;
  airport_icao: string;
}

export default function DashboardPage() {
  const [unityUrl] = useState('http://localhost:8080');
  const [isUnityConnected, setIsUnityConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [flightMeta, setFlightMeta] = useState<FlightMeta | null>(null);
  const [isLoadingFlights, setIsLoadingFlights] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

        {/* Right Sidebar - Flight Stats Panels */}
        <div className="w-80 flex flex-col gap-4">
          {/* Flight Overview */}
          <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
            <h3 className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <Plane size={14} className="text-blue-400" />
              Flight Overview
            </h3>
            {isLoadingFlights ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw size={20} className="text-slate-500 animate-spin" />
              </div>
            ) : flightMeta ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Total Flights</span>
                  <span className="text-white text-xl font-bold">{flightMeta.count}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Airport</span>
                  <span className="text-white text-sm font-mono">{flightMeta.airport_icao}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Utilization</span>
                  <span className="text-emerald-400 text-sm font-bold">{getUtilization()}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                    style={{ width: `${getUtilization()}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Unable to load flight data</p>
            )}
          </div>

          {/* Flight Status Breakdown */}
          <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
            <h3 className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <Activity size={14} className="text-blue-400" />
              Status Breakdown
            </h3>
            {isLoadingFlights ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw size={20} className="text-slate-500 animate-spin" />
              </div>
            ) : flightMeta?.status_counts ? (
              <div className="space-y-2">
                {Object.entries(flightMeta.status_counts).map(([status, count]) => {
                  const colors = getStatusColor(status);
                  const percentage = flightMeta.count > 0 ? Math.round((count / flightMeta.count) * 100) : 0;
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
                      <span className="text-slate-400 text-xs flex-1">{colors.label}</span>
                      <span className="text-white text-xs font-mono">{count}</span>
                      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors.bg} rounded-full`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No status data available</p>
            )}
          </div>

          {/* Data Sources */}
          <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4">
            <h3 className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <ArrowUpDown size={14} className="text-blue-400" />
              Data Sources
            </h3>
            {isLoadingFlights ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw size={20} className="text-slate-500 animate-spin" />
              </div>
            ) : flightMeta ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">OpenSky Matched</span>
                  <span className="text-emerald-400 text-xs font-mono">{flightMeta.opensky_enriched}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Aircraft Nearby</span>
                  <span className="text-blue-400 text-xs font-mono">{flightMeta.opensky_aircraft_nearby}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Arrivals</span>
                  <span className="text-slate-300 text-xs font-mono">{flightMeta.arrivals_fetched}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-xs">Departures</span>
                  <span className="text-slate-300 text-xs font-mono">{flightMeta.departures_fetched}</span>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Unable to load data sources</p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl border border-slate-700/50 p-4 flex-1">
            <h3 className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <Radio size={14} className="text-blue-400" />
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/" className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700/50 transition-colors text-left">
                <Plane size={18} className="text-blue-400 mb-2" />
                <p className="text-slate-300 text-xs font-bold">Config</p>
                <p className="text-slate-500 text-[10px]">Flow Setup</p>
              </Link>
              <Link href="/active-flights" className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700/50 transition-colors text-left">
                <Activity size={18} className="text-emerald-400 mb-2" />
                <p className="text-slate-300 text-xs font-bold">Flights</p>
                <p className="text-slate-500 text-[10px]">View All</p>
              </Link>
              <button onClick={fetchFlightStats} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700/50 transition-colors text-left">
                <RefreshCw size={18} className="text-purple-400 mb-2" />
                <p className="text-slate-300 text-xs font-bold">Refresh</p>
                <p className="text-slate-500 text-[10px]">Flight Data</p>
              </button>
              <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700/50 transition-colors text-left">
                <Maximize2 size={18} className="text-amber-400 mb-2" />
                <p className="text-slate-300 text-xs font-bold">Fullscreen</p>
                <p className="text-slate-500 text-[10px]">Unity View</p>
              </button>
            </div>
            {lastUpdated && (
              <p className="text-slate-500 text-[10px] text-center mt-4">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
