'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plane, LayoutGrid, Info, Globe, Activity, Navigation, ChevronRight } from 'lucide-react';

const FlightMap = dynamic(() => import('@/components/FlightMap'), {
    ssr: false,
    loading: () => <div className="flex-1 bg-slate-50 animate-pulse rounded-[48px]" />
});

export default function ActiveFlightsPage() {
    const [selectedId, setSelectedId] = useState<string | null>('MS-441');
    const [manageId, setManageId] = useState<string | null>(null);
    const [time, setTime] = useState(new Date());
    const [mounted, setMounted] = useState(false);

    // HBE Hub Data Simulation
    const [flights, setFlights] = useState([
        {
            id: 'MS-441',
            status: 'ON FINAL',
            statusClass: 'text-emerald-600 bg-emerald-50 border-emerald-100',
            route: 'Dubai (DXB) ➔ HBE',
            eta: 12, progress: 92,
            coords: [30.9500, 29.6500] as [number, number],
            passengers: 184, maxCap: 200, aircraft: 'Boeing 737-800'
        },
        {
            id: 'QR-1301',
            status: 'APPROACH',
            statusClass: 'text-blue-600 bg-blue-50 border-blue-100',
            route: 'Doha (DOH) ➔ HBE',
            eta: 45, progress: 75,
            coords: [30.8800, 29.8500] as [number, number],
            passengers: 210, maxCap: 280, aircraft: 'Airbus A320'
        },
        {
            id: 'TU-512',
            status: 'DEPARTED',
            statusClass: 'text-slate-500 bg-slate-100 border-slate-200',
            route: 'HBE ➔ Tunis (TUN)',
            eta: 140, progress: 15,
            coords: [31.1000, 29.5000] as [number, number],
            passengers: 98, maxCap: 120, aircraft: 'Boeing 737-700'
        }
    ]);

    useEffect(() => {
        setMounted(true);
        const timer = setInterval(() => {
            setTime(new Date());
            setFlights(prev => prev.map(f => ({
                ...f,
                eta: f.eta > 0 ? f.eta - 0.1 : 0,
                progress: f.progress < 100 ? f.progress + 0.05 : 100
            })));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="h-screen w-full bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden flex flex-col">
            <div className="flex flex-1 min-h-0 p-8 gap-8 overflow-hidden">

                {/* SIDEBAR: Scrollable Flight Registry */}
                <div className="w-[440px] flex flex-col h-full shrink-0">
                    <div className="flex items-center justify-between px-2 mb-6 shrink-0">
                        <div>
                            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">HBE Terminal Ops</h2>
                            <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase tracking-widest italic">Live Hub Sync</p>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-black text-slate-800">
                                {mounted ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">EET / GMT+2</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar pb-4">
                        {flights.map((f) => (
                            <div
                                key={f.id}
                                onClick={() => setSelectedId(f.id)}
                                className={`group rounded-[28px] border transition-all duration-500 cursor-pointer overflow-hidden ${selectedId === f.id
                                        ? 'bg-white border-blue-600 shadow-2xl shadow-blue-600/10 scale-[1.01]'
                                        : 'bg-white/60 border-slate-200 hover:border-slate-300 shadow-sm'
                                    }`}
                            >
                                <div className="p-7">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${selectedId === f.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                <Plane size={18} />
                                            </div>
                                            <h3 className="text-2xl font-black text-slate-800 tracking-tighter italic">{f.id}</h3>
                                        </div>
                                        <span className={`text-[9px] font-black px-3 py-1.5 rounded-full border uppercase tracking-widest ${f.statusClass}`}>
                                            {f.status}
                                        </span>
                                    </div>

                                    <div className="mb-6">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Route</p>
                                        <p className="text-sm font-bold text-slate-700 tracking-tight">{f.route}</p>
                                    </div>

                                    <div className="space-y-3 mb-6">
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                            <span className="text-slate-400">Time to Arrival</span>
                                            <span className="text-blue-600 italic">{Math.floor(f.eta)} MIN</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-600 transition-all duration-1000 shadow-[0_0_10px_#2563eb]"
                                                style={{ width: `${f.progress}%` }}
                                            />
                                        </div>
                                    </div>

                                    {manageId === f.id && (
                                        <div className="pt-6 border-t border-slate-50 space-y-5 animate-in fade-in slide-in-from-top-4">
                                            <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-700">
                                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Aircraft</p>
                                                    {f.aircraft}
                                                </div>
                                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Load</p>
                                                    {Math.round((f.passengers / f.maxCap) * 100)}%
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={(e) => { e.stopPropagation(); setManageId(manageId === f.id ? null : f.id); }}
                                        className={`w-full mt-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${manageId === f.id ? 'bg-slate-900 text-white shadow-xl' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                            }`}
                                    >
                                        {manageId === f.id ? 'Close Telemetry' : 'View Flight Details'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* MAIN CONTENT: Map (Flexible) and Stats (Fixed) */}
                <div className="flex-1 flex flex-col min-h-0 gap-8">
                    <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-[48px] overflow-hidden relative shadow-2xl group">
                        <FlightMap center={flights.find(f => f.id === selectedId)?.coords || [30.9177, 29.6964]} selectedId={selectedId} />

                        <div className="absolute top-8 left-8 p-5 bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-xl flex items-center gap-4">
                            <Globe size={18} className="text-blue-600" />
                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">HBE Radar / Sector 4</span>
                        </div>
                    </div>

                    {/* Stats HUD - Guaranteed to be visible at h-32 */}
                    <div className="h-32 grid grid-cols-4 gap-6 shrink-0">
                        {[
                            { label: 'Active Arrivals', val: '14', icon: <Navigation className="rotate-90" />, color: 'text-blue-600' },
                            { label: 'Departures', val: '08', icon: <Navigation className="rotate-[270deg]" />, color: 'text-slate-400' },
                            { label: 'System Load', val: '42%', icon: <Activity />, color: 'text-emerald-500' },
                            { label: 'Weather', val: 'CAVOK', icon: <Info />, color: 'text-amber-500' }
                        ].map((s, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-[32px] p-6 flex items-center justify-between shadow-sm hover:shadow-md transition-all">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1">{s.label}</p>
                                    <p className="text-2xl font-black text-slate-800 italic">{s.val}</p>
                                </div>
                                <div className={`p-3 rounded-2xl bg-slate-50 ${s.color}`}>
                                    {s.icon}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}