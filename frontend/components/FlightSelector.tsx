"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Radio } from 'lucide-react';

const FlightSelector = ({ onFlightsFetched }: { onFlightsFetched?: (flights: any) => void }) => {
    const [selectedAirport, setSelectedAirport] = useState('HBE');
    const [selectedStatus, setSelectedStatus] = useState('active');
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    const airports = [
        { code: 'HBE', name: 'Borg El Arab (Alexandria)' },
        { code: 'CAI', name: 'Cairo International' },
        { code: 'DXB', name: 'Dubai International' },
        { code: 'JFK', name: 'John F. Kennedy' },
        { code: 'LHR', name: 'London Heathrow' }
    ];

    const flightStatuses = ['all', 'scheduled', 'active', 'landed', 'cancelled', 'incident', 'diverted'];

    // Wrap the fetch logic so it can be reused by the timer
    const handleFetchFlights = useCallback(async (isAuto = false) => {
        if (!isAuto) setLoading(true);
        try {
            const response = await fetch(`http://localhost:5000/api/fetch-active-flights?airport=${selectedAirport}&status=${selectedStatus}`);
            const data = await response.json();
            
            console.log('🔵 API Response:', data);
            
            if (response.ok) {
                setLastUpdated(new Date().toLocaleTimeString());
                if (!isAuto) alert(`✅ Success! Downloaded ${data.meta.count} flights.`);
                
                // Call the callback with fetched flights
                if (onFlightsFetched) {
                    console.log('📍 Flights to map:', data.flights || []);
                    onFlightsFetched(data.flights || []);
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
    }, [selectedAirport, selectedStatus, onFlightsFetched]);

    // Timer Logic for Auto-Refresh
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (autoRefresh) {
            interval = setInterval(() => {
                handleFetchFlights(true);
            }, 60000); // 60 Seconds
        }
        return () => clearInterval(interval);
    }, [autoRefresh, handleFetchFlights]);

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
                <select 
                    value={selectedAirport} 
                    onChange={(e) => setSelectedAirport(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs font-semibold cursor-pointer outline-none focus:border-[#1ED5F4] appearance-auto"
                >
                    {airports.map(ap => (
                        <option key={ap.code} value={ap.code}>
                            {ap.code} - {ap.name}
                        </option>
                    ))}
                </select>

                <select 
                    value={selectedStatus} 
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs font-semibold cursor-pointer outline-none focus:border-[#1ED5F4] appearance-auto"
                >
                    {flightStatuses.map(status => (
                        <option key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </option>
                    ))}
                </select>

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
                    {autoRefresh ? 'Live Sync: ON (60s)' : 'Live Sync: OFF'}
                </button>
            </div>
        </div>
    );
};

export default FlightSelector;