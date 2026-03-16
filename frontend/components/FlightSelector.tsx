"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Radio } from 'lucide-react';

const FlightSelector = ({ onFlightsFetched, onAirportChange }: { onFlightsFetched?: (flights: any) => void, onAirportChange?: (airportCode: string) => void }) => {
    const [selectedAirport, setSelectedAirport] = useState('HBE');
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    const formatSyncTime = () =>
        new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

    // Wrap the fetch logic so it can be reused by the timer
    const handleFetchFlights = useCallback(async (isAuto = false) => {
        if (!isAuto) setLoading(true);
        try {
            const response = await fetch(`http://localhost:5000/api/fetch-active-flights?airport=${selectedAirport}&status=all`);
            const data = await response.json();
            
            console.log('🔵 API Response:', data);
            
            if (response.ok) {
                setLastUpdated(formatSyncTime());
                if (!isAuto) alert(`✅ Success! Downloaded ${data.meta.count} flights.`);
                
                // Call the callback with fetched flights
                if (onFlightsFetched) {
                    const flights = Array.isArray(data.flights) ? data.flights : [];
                    console.log('📍 Flights to map:', flights);
                    onFlightsFetched(flights);
                } else {
                    console.warn('⚠️ onFlightsFetched callback not provided');
                }
            } else {
                console.error('❌ API Error:', data);
            }
        } catch (error) {
            console.error('Fetch Error:', error);
            if (!isAuto) alert('❌ Backend is not responding.');
        } finally {
            if (!isAuto) setLoading(false);
        }
    }, [selectedAirport, onFlightsFetched]);

    // Timer Logic for Auto-Refresh
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (autoRefresh) {
            interval = setInterval(() => {
                handleFetchFlights(true);
            }, 30000); // 60 Seconds
        }
        return () => clearInterval(interval);
    }, [autoRefresh, handleFetchFlights]);

    useEffect(() => {
        if (onAirportChange) {
            onAirportChange(selectedAirport);
        }
    }, [selectedAirport, onAirportChange]);

    return (
        <div className="p-4 border border-slate-200 rounded-xl bg-white shadow-sm text-slate-800 w-full">
            <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
                <h3 className="font-bold text-sm flex items-center gap-2">
                    ✈️ Live Flight Integration
                </h3>
                {lastUpdated && (
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Sync: {lastUpdated}
                    </span>
                )}
            </div>
            
            <div className="flex flex-col gap-3">
                <input
                    type="text"
                    value={selectedAirport}
                    onChange={(e) => setSelectedAirport(e.target.value.toUpperCase().slice(0, 4))}
                    placeholder="Airport code"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs font-semibold outline-none focus:border-[#1ED5F4] uppercase tracking-widest"
                />

                <button 
                    onClick={() => handleFetchFlights(false)} 
                    disabled={loading}
                    className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 ${
                        loading ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-[#1ED5F4] hover:bg-[#1ac1de] text-slate-900'
                    }`}
                >
                    {loading ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {loading ? 'Fetching...' : '📥 Import Live Flights'}
                </button>

                {/* Auto-Refresh Toggle Button */}
                <button 
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 border ${
                        autoRefresh 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-inner' 
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                >
                    <Radio size={14} className={autoRefresh ? "animate-pulse" : ""} />
                    {autoRefresh ? 'Live Sync: ON (30s)' : 'Live Sync: OFF'}
                </button>
            </div>
        </div>
    );
};

export default FlightSelector;