'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plane, Info, Globe, Activity, Navigation, ChevronDown, Users, Radar, Repeat, Crown, Clock, X, PieChart } from 'lucide-react';
import FlightSelector from '@/components/FlightSelector';

const FlightMap = dynamic(() => import('@/components/FlightMap'), {
    ssr: false,
    loading: () => <div className="flex-1 bg-slate-50 animate-pulse rounded-[48px]" />
});

const AircraftViewer = dynamic(() => import('@/components/AircraftViewer'), {
    ssr: false,
    loading: () => <div className="flex-1 bg-transparent flex items-center justify-center animate-pulse"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Init 3D...</p></div>
});

const AIRCRAFT_CONFIG: Record<string, { maxCap: number }> = {
    'Boeing 737-800': { maxCap: 189 },
    'Boeing 737-200': { maxCap: 130 },
    'Boeing 787-9': { maxCap: 290 },
    'Airbus A320neo': { maxCap: 180 },
    'Airbus A350-900': { maxCap: 350 },
    'Boeing 777-300ER': { maxCap: 396 },
    'Embraer E190': { maxCap: 114 }
};

const MODEL_CONFIG: Record<string, { path: string, scale: number }> = {
    'Boeing 737-800': { path: '/models/scene.gltf', scale: 0.25 },
    'Boeing 737-200': { path: '/models/scene.gltf', scale: 0.25 },
    'Airbus A320neo': { path: '/models/Airbus A320.glb', scale: 0.25 },
    'Embraer E190': { path: '/models/embraer_erj_145.glb', scale: 0.25 },
    'Boeing 777-300ER': { path: '/models/boeing_777-300er_model.glb', scale: 0.20 },
};

const ABS_PERSONAS = {
    p1: { label: 'Dom. O&D Business', color: 'bg-blue-400', text: 'text-blue-500' },
    p2: { label: 'Dom. O&D Leisure', color: 'bg-sky-400', text: 'text-sky-500' },
    p3: { label: 'Int. O&D Depart', color: 'bg-indigo-400', text: 'text-indigo-500' },
    p4: { label: 'Int. O&D Arrive', color: 'bg-violet-400', text: 'text-violet-500' },
    p5: { label: 'Dom. Transfer', color: 'bg-amber-400', text: 'text-amber-500' },
    p6: { label: 'Int. Transfer', color: 'bg-orange-400', text: 'text-orange-500' },
    p7: { label: 'Premium (All)', color: 'bg-emerald-400', text: 'text-emerald-500' }
};

type PersonaKey = keyof typeof ABS_PERSONAS;

export default function ActiveFlightsPage() {
    const [selectedId, setSelectedId] = useState<string | null>('MS-441');
    const [manageId, setManageId] = useState<string | null>(null);
    const [time, setTime] = useState(new Date());
    const [mounted, setMounted] = useState(false);
    const [showCard, setShowCard] = useState(false);
    const [mapFlights, setMapFlights] = useState<any[]>([]);

    const [flights, setFlights] = useState([
        {
            id: 'MS-441', status: 'ON FINAL', statusClass: 'text-emerald-600 bg-emerald-50 border-emerald-100',
            origin: 'DXB', originName: 'Dubai', dest: 'HBE', destName: 'Alexandria',
            eta: 12, progress: 92, coords: [30.9500, 29.6500] as [number, number],
            passengers: 150, aircraft: 'Boeing 737-800',
            personas: { p1: 0, p2: 0, p3: 0, p4: 70, p5: 0, p6: 20, p7: 10 }
        },
        {
            id: 'QR-1301', status: 'APPROACH', statusClass: 'text-blue-600 bg-blue-50 border-blue-100',
            origin: 'DOH', originName: 'Doha', dest: 'HBE', destName: 'Alexandria',
            eta: 45, progress: 75, coords: [30.8800, 29.8500] as [number, number],
            passengers: 140, aircraft: 'Airbus A320neo',
            personas: { p1: 0, p2: 0, p3: 0, p4: 60, p5: 0, p6: 25, p7: 15 }
        },
        {
            id: 'TU-512', status: 'DEPARTED', statusClass: 'text-slate-500 bg-slate-100 border-slate-200',
            origin: 'HBE', originName: 'Alexandria', dest: 'TUN', destName: 'Tunis',
            eta: 140, progress: 15, coords: [31.1000, 29.5000] as [number, number],
            passengers: 80, aircraft: 'Embraer E190',
            personas: { p1: 0, p2: 0, p3: 80, p4: 0, p5: 0, p6: 10, p7: 10 }
        }
    ]);

    // Handle fetched flights from API and transform for map display
    const handleFlightsFetched = (apiFlight: any[]) => {
        console.log('🎯 Received API flights in page:', apiFlight);
        
        // Deduplicate flights by flight_id
        const uniqueFlights = Array.from(new Map(apiFlight.map(f => [f.flight_id, f])).values());
        console.log('✅ Deduplicated flights (removed duplicates):', uniqueFlights);
        
        const transformedFlights = uniqueFlights.map((f, idx) => {
            const transformed = {
                id: f.flight_id,
                coords: [
                    30.9177 + (Math.sin(idx) * 0.3),
                    29.6964 + (Math.cos(idx) * 0.3)
                ] as [number, number],
                heading: (idx * 120) % 360
            };
            console.log(`✈️ Transformed flight ${idx}:`, transformed);
            return transformed;
        });
        
        console.log('📊 All transformed flights:', transformedFlights);
        setMapFlights(transformedFlights);
    };

    const handleAircraftChange = (flightId: string, newAircraft: string) => {
        const newMax = AIRCRAFT_CONFIG[newAircraft].maxCap;
        setFlights(prev => prev.map(f => f.id === flightId ? { ...f, aircraft: newAircraft, passengers: Math.min(f.passengers, newMax) } : f));
    };

    const handlePassengerChange = (flightId: string, count: number) => {
        setFlights(prev => prev.map(f => f.id === flightId ? { ...f, passengers: count } : f));
    };

    const handlePersonaChange = (flightId: string, key: PersonaKey, newValue: number) => {
        setFlights(prev => prev.map(f => {
            if (f.id !== flightId) return f;
            let p = { ...f.personas };
            const diff = newValue - p[key];
            p[key] = newValue;

            if (diff !== 0) {
                let remainingDiff = diff;
                while (Math.abs(remainingDiff) > 0.5) {
                    const others = (Object.keys(p) as PersonaKey[]).filter(k => k !== key && (remainingDiff > 0 ? p[k] > 0 : p[k] < 100));
                    if (others.length === 0) break;

                    let targetKey = others[0];
                    others.forEach(k => {
                        if (remainingDiff > 0 && p[k] > p[targetKey]) targetKey = k;
                        if (remainingDiff < 0 && p[k] < p[targetKey]) targetKey = k;
                    });

                    const change = remainingDiff > 0 ? Math.min(remainingDiff, p[targetKey]) : Math.max(remainingDiff, p[targetKey] - 100);
                    p[targetKey] -= change;
                    remainingDiff -= change;
                }
            }

            (Object.keys(p) as PersonaKey[]).forEach(k => p[k] = Math.round(p[k]));
            return { ...f, personas: p };
        }));
    };

    useEffect(() => {
        setMounted(true);
        const timer = setInterval(() => {
            setTime(new Date());
            setFlights(prev => prev.map(f => ({ ...f, eta: f.eta > 0 ? f.eta - 0.1 : 0, progress: f.progress < 100 ? f.progress + 0.05 : 100 })));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const activeFlight = flights.find(f => f.id === selectedId);
    const has3DModel = activeFlight && MODEL_CONFIG[activeFlight.aircraft];

    const odTotal = activeFlight ? activeFlight.personas.p1 + activeFlight.personas.p2 + activeFlight.personas.p3 + activeFlight.personas.p4 : 0;
    const transferTotal = activeFlight ? activeFlight.personas.p5 + activeFlight.personas.p6 : 0;
    const premiumTotal = activeFlight ? activeFlight.personas.p7 : 0;

    return (
        <div className="h-screen w-full bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden flex flex-col">
            <div className="flex flex-1 min-h-0 p-8 gap-8 overflow-hidden">

                {/* SIDEBAR */}
                <div className="w-[440px] flex flex-col h-full shrink-0 relative z-30">
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

                    {/* Flight List Container (Scrollable with massive padding at the bottom) */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar pb-32">
                        {flights.map((f, idx) => {
                            const currentMax = AIRCRAFT_CONFIG[f.aircraft].maxCap;
                            return (
                                <div
                                    key={`flight-${idx}-${f.id}`}
                                    onClick={() => {
                                        setSelectedId(f.id);
                                        setShowCard(true); 
                                    }}
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

                                        <div className="flex items-center justify-between mt-2 mb-8">
                                            <div className="text-left">
                                                <p className="text-2xl font-black text-slate-800 tracking-tighter">{f.origin}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{f.originName}</p>
                                            </div>
                                            <div className="flex-1 px-4 relative flex items-center justify-center">
                                                <div className="absolute w-full border-t-2 border-dashed border-slate-200"></div>
                                                <div className="w-2 h-2 rounded-full bg-slate-300 absolute left-4"></div>
                                                <Plane size={16} className="text-blue-500 bg-white px-1 relative z-10" />
                                                <div className="w-2 h-2 rounded-full border-2 border-blue-500 bg-white absolute right-4"></div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-black text-slate-800 tracking-tighter">{f.dest}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{f.destName}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-3 mb-6">
                                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                                <span className="text-slate-400">Time to Arrival</span>
                                                <span className="text-blue-600 italic">{Math.floor(f.eta)} MIN</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-600 transition-all duration-1000 shadow-[0_0_10px_#2563eb]" style={{ width: `${f.progress}%` }} />
                                            </div>
                                        </div>

                                        {manageId === f.id && (
                                            <div className="pt-6 border-t border-slate-50 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Select Aircraft Type</label>
                                                    <div className="relative">
                                                        <select value={f.aircraft} onChange={(e) => handleAircraftChange(f.id, e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 appearance-none cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/10">
                                                            {Object.keys(AIRCRAFT_CONFIG).map(type => <option key={type} value={type}>{type}</option>)}
                                                        </select>
                                                        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Passengers</label>
                                                        <span className="text-[11px] font-black text-blue-600">{f.passengers} / {currentMax}</span>
                                                    </div>
                                                    <input type="range" min="0" max={currentMax} value={f.passengers} onChange={(e) => handlePassengerChange(f.id, parseInt(e.target.value))} className="w-full h-1.5 bg-slate-100 rounded-full appearance-none accent-blue-600 cursor-pointer" />
                                                </div>

                                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-5">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ABS Personas</label>
                                                        <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded uppercase">100% Balanced</span>
                                                    </div>

                                                    <div className="space-y-3">
                                                        {(Object.keys(ABS_PERSONAS) as PersonaKey[]).map(key => (
                                                            <div key={key} className="flex items-center gap-3">
                                                                <span className={`w-2 h-2 rounded-full ${ABS_PERSONAS[key].color}`} />
                                                                <div className="flex-1 flex flex-col">
                                                                    <div className="flex justify-between items-center mb-1">
                                                                        <span className="text-[9px] font-bold text-slate-500">{ABS_PERSONAS[key].label}</span>
                                                                        <span className={`text-[10px] font-black ${ABS_PERSONAS[key].text}`}>{f.personas[key]}%</span>
                                                                    </div>
                                                                    <input
                                                                        type="range" min="0" max="100"
                                                                        value={f.personas[key]}
                                                                        onChange={(e) => handlePersonaChange(f.id, key, parseInt(e.target.value))}
                                                                        className="w-full h-1 bg-slate-200 rounded-full appearance-none accent-slate-400 cursor-pointer"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={(e) => { e.stopPropagation(); setManageId(manageId === f.id ? null : f.id); }}
                                            className={`w-full mt-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 ${manageId === f.id ? 'bg-slate-900 text-white shadow-xl' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                        >
                                            {manageId === f.id ? 'Close Config' : 'Config Flight Details'}
                                            <ChevronDown size={14} className={`transition-transform duration-300 ${manageId === f.id ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {/* ========================================== */}
                        {/* ✈️ CONTROL PANEL RESTORED TO THE BOTTOM */}
                        {/* ========================================== */}
                        <div className="mt-6 pt-6 border-t border-slate-200">
                            <FlightSelector onFlightsFetched={handleFlightsFetched} />
                        </div>
                    </div>
                </div>

                {/* UNIFIED MAIN CONTENT AREA - MAP IS NOW THE HERO */}
                <div className="flex-1 relative min-h-0 w-full h-full bg-[#F8FAFC] rounded-[48px] overflow-hidden border border-slate-200 shadow-inner">

                    {/* FULL SCREEN MAP */}
                    <div className="absolute inset-0 z-0">
                        <FlightMap center={activeFlight?.coords || [30.9177, 29.6964]} selectedId={selectedId} flights={mapFlights} />
                    </div>

                    {/* TOP LEFT RADAR BADGE */}
                    <div className="absolute top-8 left-8 p-4 bg-white/80 backdrop-blur-xl border border-white rounded-3xl shadow-xl flex items-center gap-4 z-10 pointer-events-none">
                        <Globe size={20} className="text-blue-600 animate-[spin_10s_linear_infinite]" />
                        <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">HBE Sector 4 Live</span>
                    </div>

                    {/* RE-OPEN BUTTON (Shows when the card is hidden) */}
                    {activeFlight && !showCard && (
                        <div className="absolute top-8 right-8 z-20 animate-in fade-in zoom-in-95">
                            <button
                                onClick={() => setShowCard(true)}
                                className="px-5 py-4 bg-white/90 hover:bg-white backdrop-blur-xl border border-white rounded-[24px] shadow-2xl flex items-center gap-3 transition-all duration-300 hover:scale-105"
                            >
                                <div className="p-1.5 bg-blue-100 rounded-full">
                                    <PieChart size={16} className="text-blue-600" />
                                </div>
                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Open Analytics</span>
                            </button>
                        </div>
                    )}

                    {/* TOP RIGHT INSPECTOR CARD (WITH 3D & GANTT & PIE CHARTS) */}
                    {activeFlight && showCard && (
                        <div className="absolute top-8 right-8 bottom-8 w-[380px] bg-white/85 backdrop-blur-2xl border border-white rounded-[32px] shadow-2xl z-20 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-8 duration-500">

                            {/* Card Header */}
                            <div className="p-6 bg-white/50 border-b border-slate-100 flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900 tracking-tighter italic">{activeFlight.id}</h3>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{activeFlight.aircraft}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className={`text-[9px] font-black px-3 py-1.5 rounded-full border uppercase tracking-widest shadow-sm ${activeFlight.statusClass}`}>
                                        {activeFlight.status}
                                    </span>
                                    <button
                                        onClick={() => setShowCard(false)}
                                        className="p-2 bg-white/60 hover:bg-white rounded-full text-slate-400 hover:text-slate-800 transition-colors shadow-sm border border-slate-200"
                                    >
                                        <X size={14} strokeWidth={3} />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Content Area */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {/* 3D Viewer Container */}
                                <div className="h-[200px] w-full relative bg-gradient-to-b from-transparent to-slate-100/50 shadow-inner overflow-hidden shrink-0">
                                    {mounted && has3DModel ? (
                                        <AircraftViewer
                                            key={`card-3d-${selectedId}-${activeFlight.aircraft}`}
                                            modelPath={MODEL_CONFIG[activeFlight.aircraft].path}
                                            modelScale={MODEL_CONFIG[activeFlight.aircraft].scale}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center opacity-30">
                                            <Radar size={48} className="text-slate-400 mb-3 animate-[spin_4s_linear_infinite]" />
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Asset Offline</span>
                                        </div>
                                    )}
                                </div>

                                {/* Detailed Analytics Area */}
                                <div className="p-6 space-y-8 bg-white/50">

                                    {/* Flight Progress Gantt Chart */}
                                    <div>
                                        <div className="flex justify-between items-end mb-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Flight Progress</span>
                                            <div className="flex items-center gap-1.5 text-blue-600">
                                                <Clock size={10} />
                                                <span className="text-[10px] font-black uppercase tracking-widest italic">{Math.floor(activeFlight.eta)}m ETA</span>
                                            </div>
                                        </div>
                                        <div className="relative h-2 bg-slate-200 rounded-full">
                                            {/* Progress Bar */}
                                            <div className="absolute top-0 left-0 h-full bg-blue-600 rounded-full transition-all duration-1000" style={{ width: `${activeFlight.progress}%` }} />

                                            {/* Moving Airplane Icon */}
                                            <div
                                                className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-blue-600 rounded-full flex items-center justify-center shadow-lg transition-all duration-1000 z-10"
                                                style={{ left: `calc(${activeFlight.progress}% - 12px)` }}
                                            >
                                                <Plane size={10} className="text-blue-600" />
                                            </div>
                                        </div>
                                        <div className="flex justify-between mt-3">
                                            <span className="text-[9px] font-black text-slate-500">{activeFlight.origin}</span>
                                            <span className="text-[9px] font-black text-slate-500">{activeFlight.dest}</span>
                                        </div>
                                    </div>

                                    {/* Payload Linear Bar Chart */}
                                    <div>
                                        <div className="flex justify-between items-end mb-2">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cabin Load Factor</span>
                                            <span className="text-xs font-black text-slate-800">{activeFlight.passengers} <span className="text-slate-400">/ {AIRCRAFT_CONFIG[activeFlight.aircraft].maxCap} PAX</span></span>
                                        </div>
                                        <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner flex">
                                            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${(activeFlight.passengers / AIRCRAFT_CONFIG[activeFlight.aircraft].maxCap) * 100}%` }} />
                                        </div>
                                    </div>

                                    {/* MODERN SVG DONUT CHART (ACRP 25 Breakdown) */}
                                    <div className="pt-6 border-t border-slate-200">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-4">Passenger Flow Demographics</span>

                                        <div className="flex items-center gap-6">
                                            {/* The Donut Chart */}
                                            <div className="relative w-24 h-24 shrink-0">
                                                <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                                    {/* Background Ring */}
                                                    <circle cx="18" cy="18" r="15.9155" fill="transparent" stroke="#f1f5f9" strokeWidth="4" />

                                                    {/* O&D Segment (Blue) */}
                                                    {odTotal > 0 && (
                                                        <circle cx="18" cy="18" r="15.9155" fill="transparent" stroke="#3b82f6" strokeWidth="4"
                                                            strokeDasharray={`${odTotal} ${100 - odTotal}`} strokeDashoffset="0" className="transition-all duration-500" />
                                                    )}

                                                    {/* Transfer Segment (Amber) */}
                                                    {transferTotal > 0 && (
                                                        <circle cx="18" cy="18" r="15.9155" fill="transparent" stroke="#f59e0b" strokeWidth="4"
                                                            strokeDasharray={`${transferTotal} ${100 - transferTotal}`} strokeDashoffset={`-${odTotal}`} className="transition-all duration-500" />
                                                    )}

                                                    {/* Premium Segment (Emerald) */}
                                                    {premiumTotal > 0 && (
                                                        <circle cx="18" cy="18" r="15.9155" fill="transparent" stroke="#10b981" strokeWidth="4"
                                                            strokeDasharray={`${premiumTotal} ${100 - premiumTotal}`} strokeDashoffset={`-${odTotal + transferTotal}`} className="transition-all duration-500" />
                                                    )}
                                                </svg>
                                                {/* Donut Center Text */}
                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                    <span className="text-lg font-black text-slate-800">{activeFlight.passengers}</span>
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Total</span>
                                                </div>
                                            </div>

                                            {/* Donut Legend */}
                                            <div className="flex-1 flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Origin/Dest</span>
                                                    </div>
                                                    <span className="text-xs font-black text-blue-600">{odTotal}%</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Transfer</span>
                                                    </div>
                                                    <span className="text-xs font-black text-amber-500">{transferTotal}%</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Premium</span>
                                                    </div>
                                                    <span className="text-xs font-black text-emerald-500">{premiumTotal}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}