'use client';

import React from 'react';
import { Map, Overlay } from 'pigeon-maps';
import { Plane } from 'lucide-react';

export default function FlightMap({ center, selectedId }: { center: [number, number], selectedId: string | null }) {
    const activeHubFlights = [
        { id: 'MS-441', pos: [30.9500, 29.6500] as [number, number], heading: 135 },
        { id: 'QR-1301', pos: [30.8800, 29.8500] as [number, number], heading: 220 },
        { id: 'TU-512', pos: [31.1000, 29.5000] as [number, number], heading: 310 },
    ];

    return (
        <div className="w-full h-full relative holographic-radar overflow-hidden">
            <Map center={center} zoom={11} animate={true} dpr={2}>

                {/* HBE Hub Center */}
                <Overlay anchor={[30.9177, 29.6964]} offset={[40, 40]}>
                    <div className="relative flex items-center justify-center w-20 h-20">
                        <div className="absolute w-full h-full border border-blue-500/20 rounded-full animate-[ping_3s_linear_infinite]" />
                        <div className="w-4 h-4 bg-blue-600 rounded-full shadow-[0_0_15px_#2563eb] border-2 border-white" />
                    </div>
                </Overlay>

                {/* ALWAYS BLUE AIRCRAFT ICONS */}
                {activeHubFlights.map((f) => {
                    const isSelected = selectedId === f.id;
                    return (
                        <Overlay key={f.id} anchor={f.pos} offset={[24, 24]}>
                            <div className="flex flex-col items-center group cursor-pointer">

                                <div className="relative">
                                    {/* Neon Aura */}
                                    <div className={`absolute inset-0 rounded-full bg-blue-400/40 blur-xl transition-all duration-500 ${isSelected ? 'scale-150 opacity-100' : 'scale-100 opacity-20'
                                        }`} />

                                    {/* The Icon Shell */}
                                    <div
                                        style={{ transform: `rotate(${f.heading}deg)` }}
                                        className={`w-12 h-12 flex items-center justify-center rounded-full border-2 transition-all duration-500 shadow-lg ${isSelected
                                                ? 'bg-blue-600 border-white scale-125 z-50 shadow-[0_0_30px_rgba(37,99,235,0.8)]'
                                                : 'bg-blue-500 border-blue-200 opacity-90 group-hover:opacity-100 shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                                            }`}
                                    >
                                        <Plane
                                            size={24}
                                            fill="white"
                                            strokeWidth={0}
                                            className={isSelected ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" : ""}
                                        />
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
            </Map>
        </div>
    );
}