'use client';

import { Map, Overlay } from 'pigeon-maps';
import { Plane, MapPin } from 'lucide-react';

interface MapFlight {
    id: string;
    coords?: [number, number];
    heading?: number;
    airlineLogo?: string | null;
}

interface Airport {
    code: string;
    name: string;
    coords: [number, number];
}

export default function FlightMap({ center, selectedId, flights = [], airports = [], focusTarget = null }: { center: [number, number], selectedId: string | null, flights?: MapFlight[], airports?: Airport[], focusTarget?: [number, number] | null }) {
    const mapCenter = focusTarget || center;
    const mapZoom = focusTarget ? 13 : 11;

    // Use provided flights or fallback to default
    const activeHubFlights = flights.length > 0 ? flights.map((f, idx) => {
        console.log(`🗺️ Mapping flight ${idx}:`, f);
        return {
            id: f.id,
            pos: f.coords || [center[0] + (Math.random() - 0.5) * 0.5, center[1] + (Math.random() - 0.5) * 0.5] as [number, number],
            heading: f.heading || (idx * 120),
            airlineLogo: f.airlineLogo || null
        };
    }) : [];

    console.log('🎨 FlightMap rendered with flights:', activeHubFlights);

    return (
        <div className="w-full h-full relative holographic-radar overflow-hidden">
            <Map center={mapCenter} zoom={mapZoom} animate={true} dprs={[1, 2]}>

                {/* Selected Airport Center */}
                <Overlay anchor={center} offset={[40, 40]}>
                    <div className="relative flex items-center justify-center w-20 h-20">
                        <div className="absolute w-full h-full border border-blue-500/20 rounded-full animate-[ping_3s_linear_infinite]" />
                        <div className="w-4 h-4 bg-blue-600 rounded-full shadow-[0_0_15px_#2563eb] border-2 border-white" />
                    </div>
                </Overlay>

                {/* FLIGHT ICONS WITH AIRLINE LOGOS */}
                {activeHubFlights.map((f, idx) => {
                    const isSelected = selectedId === f.id;
                    const logoUrl = f.airlineLogo;
                    return (
                        <Overlay key={`map-flight-${idx}-${f.id}`} anchor={f.pos} offset={[24, 24]}>
                            <div className="relative z-[40] flex flex-col items-center group cursor-pointer">

                                <div className="relative">
                                    {/* Neon Aura */}
                                    <div className={`absolute inset-0 rounded-full bg-blue-400/40 blur-xl transition-all duration-500 ${isSelected ? 'scale-150 opacity-100' : 'scale-100 opacity-20'
                                        }`} />

                                    {/* The Icon Shell */}
                                    <div
                                        style={{ transform: `rotate(${f.heading}deg)` }}
                                        className={`w-12 h-12 flex items-center justify-center rounded-full border-2 transition-all duration-500 shadow-lg overflow-hidden ${isSelected
                                                ? 'bg-white border-white scale-125 z-50 shadow-[0_0_30px_rgba(37,99,235,0.8)]'
                                                : 'bg-white border-blue-200 opacity-90 group-hover:opacity-100 shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                                            }`}
                                    >
                                        {logoUrl ? (
                                            <img
                                                src={logoUrl}
                                                alt=""
                                                style={{ transform: `rotate(${-f.heading}deg)` }}
                                                className="w-10 h-10 object-contain"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                    const parent = (e.target as HTMLImageElement).parentElement;
                                                    if (parent) {
                                                        const fallback = document.createElement('div');
                                                        fallback.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="0"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';
                                                        parent.appendChild(fallback);
                                                    }
                                                }}
                                            />
                                        ) : (
                                            <Plane size={24} fill="white" strokeWidth={0} className="text-blue-500" />
                                        )}
                                    </div>
                                </div>

                                <div className={`mt-4 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all shadow-xl ${isSelected ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border border-blue-100'
                                    }`}>
                                    {f.id}
                                </div>
                            </div>
                        </Overlay>
                    );
                })}

                {/* Airport Markers (rendered last so they stay above flights) */}
                {airports.map((airport) => (
                    <Overlay key={`airport-${airport.code}`} anchor={airport.coords} offset={[24, 24]}>
                        <div className="relative z-[90] flex flex-col items-center group cursor-pointer">
                            <div className="relative">
                                <div className="absolute inset-0 rounded-full bg-orange-400/40 blur-xl scale-100" />
                                <div className="w-12 h-12 flex items-center justify-center rounded-full border-2 bg-orange-500 border-orange-200 opacity-95 group-hover:opacity-100 shadow-[0_0_20px_rgba(249,115,22,0.55)] transition-all">
                                    <MapPin size={24} fill="white" strokeWidth={0} className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                </div>
                            </div>
                            <div className={`mt-4 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all shadow-xl bg-white text-orange-600 border border-orange-100 relative z-[91]`}>
                                {airport.code}
                            </div>
                        </div>
                    </Overlay>
                ))}
            </Map>
        </div>
    );
}