'use client';

import { Edit2, Trash2, ListTree, PlusCircle, ChevronDown, Plus, ShieldHalf, Ticket, TicketsPlane, ShoppingBag, QrCode, BaggageClaim, BriefcaseConveyorBelt, ShieldUser, X } from 'lucide-react';
import StationCard from './StationCard';
import { useState, useEffect } from 'react';

interface CheckpointProps {
    id: string;
    title: string;
    idCode: string;
    type: string;
    colorType: string; // Updated to accept our dynamic string colors
    icon: React.ElementType;
    stations: { id: string; name: string; settings?: StationSettings }[];
    nextCheckpointIds?: string[];
    checkpoints: { id: string; title: string; idCode: string }[];
    onDelete: (id: string) => void;
    onUpdateStations: (id: string, stations: { id: string; name: string; settings?: StationSettings }[]) => void;
    onUpdateNextCheckpoints: (id: string, nextCheckpointIds: string[] | undefined) => void;
}

interface StationSettings {
    staffing: string;
    avgServiceTime: string;
    maxQueue: string;
    experience: string;
    allowedClass: string[];
    hasXRayScanner: boolean;
}

export default function CheckpointCard({ id, title, idCode, type, colorType, icon: Icon, stations, nextCheckpointIds, checkpoints, onDelete, onUpdateStations, onUpdateNextCheckpoints }: CheckpointProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [currentType, setCurrentType] = useState(type);
    const [showAddStation, setShowAddStation] = useState(false);
    const [applyToAll, setApplyToAll] = useState(false);
    const [showNextCheckpointsDropdown, setShowNextCheckpointsDropdown] = useState(false);
    const [newStation, setNewStation] = useState({
        id: '',
        name: ''
    });

    // Dynamically determine icon based on current type
    const getIcon = (checkpointType: string) => {
        switch (checkpointType) {
            case 'Security': return ShieldHalf;
            case 'Check-in /w Baggage Tagging': return TicketsPlane;
            case 'Digital Check-in': return QrCode;
            case 'Self-Service Bag Drop': return BaggageClaim;
            case 'Baggage Retrieval': return BriefcaseConveyorBelt;
            case 'Passport Check': return ShieldUser;
            default: return Ticket;
        }
    };

    // Dynamically determine color matching the Flow Diagram Nodes!
    const getColors = (checkpointType: string) => {
        switch (checkpointType) {
            case 'Security':
                return { border: 'border-l-amber-500', icon: 'text-amber-500' };
            case 'Check-in /w Baggage Tagging':
                return { border: 'border-l-blue-500', icon: 'text-blue-500' };
            case 'Digital Check-in':
                return { border: 'border-l-[#22D3EE]', icon: 'text-[#22D3EE]' };
            case 'Self-Service Bag Drop':
                return { border: 'border-l-purple-500', icon: 'text-purple-500' };
            case 'Baggage Retrieval':
                return { border: 'border-l-emerald-500', icon: 'text-emerald-500' };
            case 'Passport Check':
                return { border: 'border-l-rose-500', icon: 'text-rose-500' };
            default:
                return { border: 'border-l-slate-400', icon: 'text-slate-400' };
        }
    };

    const CurrentIcon = getIcon(currentType);
    const colors = getColors(currentType);
    const leftBorder = colors.border;
    const iconColor = colors.icon;

    const handleAddStation = () => {
        if (!newStation.id || !newStation.name) {
            alert('Please fill in all required fields');
            return;
        }

        // Check for duplicate station ID or name
        const duplicateId = stations.some(s => s.id.toLowerCase() === newStation.id.toLowerCase());
        const duplicateName = stations.some(s => s.name.toLowerCase() === newStation.name.toLowerCase());

        if (duplicateId) {
            alert('A station with this ID already exists in this checkpoint');
            return;
        }
        if (duplicateName) {
            alert('A station with this name already exists in this checkpoint');
            return;
        }

        // Determine default staffing based on checkpoint type
        const automatedTypes = ['Digital Check-in', 'Self-Service Bag Drop', 'Baggage Retrieval'];
        const defaultStaffing = automatedTypes.includes(currentType) ? '0' : '';

        const updatedStations = [...stations, {
            id: newStation.id,
            name: newStation.name,
            settings: {
                staffing: defaultStaffing,
                avgServiceTime: '',
                maxQueue: '',
                experience: 'Experienced',
                allowedClass: ['All Classes'],
                hasXRayScanner: false
            }
        }];
        onUpdateStations(id, updatedStations);
        setNewStation({ id: '', name: '' });
        setShowAddStation(false);
    };

    const handleDeleteStation = (stationId: string) => {
        const updatedStations = stations.filter(s => s.id !== stationId);
        onUpdateStations(id, updatedStations);
    };

    const handleStationSettingsChange = (stationId: string, settings: StationSettings) => {
        const updatedStations = stations.map(s =>
            s.id === stationId ? { ...s, settings } : s
        );
        onUpdateStations(id, updatedStations);

        // If "apply to all" is toggled and this is the first station, copy to all
        if (applyToAll && stations[0]?.id === stationId && stations.length > 1) {
            const allUpdated = stations.map(s => ({ ...s, settings }));
            onUpdateStations(id, allUpdated);
        }
    };

    const handleApplyToAllToggle = () => {
        const newApplyToAll = !applyToAll;
        setApplyToAll(newApplyToAll);

        // If turning on and there's a first station with settings, copy to all
        if (newApplyToAll && stations.length > 1 && stations[0]?.settings) {
            const firstSettings = stations[0].settings;
            const allUpdated = stations.map(s => ({ ...s, settings: firstSettings }));
            onUpdateStations(id, allUpdated);
        }
    };

    const toggleNextCheckpoint = (checkpointId: string) => {
        const currentIds = nextCheckpointIds || [];
        let newIds: string[];
        
        if (currentIds.includes(checkpointId)) {
            newIds = currentIds.filter(id => id !== checkpointId);
        } else {
            newIds = [...currentIds, checkpointId];
        }
        
        onUpdateNextCheckpoints(id, newIds.length > 0 ? newIds : undefined);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            if (showNextCheckpointsDropdown) {
                setShowNextCheckpointsDropdown(false);
            }
        };

        if (showNextCheckpointsDropdown) {
            document.addEventListener('click', handleClickOutside);
        }

        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [showNextCheckpointsDropdown]);

    return (
        <div className={`bg-white border-l-[3px] ${leftBorder} rounded shadow-sm border border-slate-200 flex flex-col`}>

            <div className="px-3 py-2 flex justify-between items-center border-b border-slate-50">
                <div className="flex items-center gap-2">
                    {currentType === 'Check-in /w Baggage Tagging' ? (
                        <div className="flex items-center -space-x-1">
                            <TicketsPlane size={16} className={iconColor} />
                            <ShoppingBag size={16} className={iconColor} />
                        </div>
                    ) : (
                        <CurrentIcon size={20} className={iconColor} />
                    )}
                    <span className="text-sm font-bold text-slate-900">{title}</span>
                </div>
                <div className="flex gap-2 text-slate-300">
                    <Edit2
                        size={14}
                        className={`cursor-pointer ${isEditing ? 'text-[#1ED5F4]' : 'hover:text-slate-500'}`}
                        onClick={() => setIsEditing(!isEditing)}
                    />
                    <Trash2
                        size={14}
                        className="cursor-pointer hover:text-red-500"
                        onClick={() => onDelete(id)}
                    />
                </div>
            </div>

            <div className="p-3 flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">ID Code</label>
                        <input
                            defaultValue={idCode}
                            disabled={!isEditing}
                            className="bg-slate-100 border border-transparent rounded px-2 h-7 text-xs text-slate-700 outline-none font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Type</label>
                        <div className="relative">
                            <select
                                value={currentType}
                                onChange={(e) => setCurrentType(e.target.value)}
                                disabled={!isEditing}
                                className="w-full bg-slate-100 border border-transparent rounded pl-2 pr-6 h-7 text-xs text-slate-700 outline-none appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <option value="Security">Security</option>
                                <option value="Check-in /w Baggage Tagging">Check-in /w Baggage Tagging</option>
                                <option value="Digital Check-in">Digital Check-in</option>
                                <option value="Self-Service Bag Drop">Self-Service Bag Drop</option>
                                <option value="Baggage Retrieval">Baggage Retrieval</option>
                                <option value="Passport Check">Passport Check</option>
                            </select>
                            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Next Checkpoint/s</label>
                    <div className="relative">
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isEditing) {
                                    setShowNextCheckpointsDropdown(!showNextCheckpointsDropdown);
                                }
                            }}
                            className={`w-full bg-slate-100 border border-transparent rounded px-2 h-7 text-xs text-slate-700 cursor-pointer flex items-center justify-between ${!isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className="truncate">
                                {nextCheckpointIds && nextCheckpointIds.length > 0
                                    ? `${nextCheckpointIds.length} selected`
                                    : '— None —'}
                            </span>
                            <ChevronDown size={10} className="text-slate-600 flex-shrink-0" />
                        </div>

                        {showNextCheckpointsDropdown && isEditing && (
                            <div 
                                onClick={(e) => e.stopPropagation()}
                                className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded shadow-lg max-h-48 overflow-y-auto"
                            >
                                {checkpoints.filter(cp => cp.id !== id).length === 0 ? (
                                    <div className="px-2 py-2 text-[11px] text-slate-400 text-center">
                                        No other checkpoints available
                                    </div>
                                ) : (
                                    checkpoints
                                        .filter(cp => cp.id !== id)
                                        .map(cp => (
                                            <div
                                                key={cp.id}
                                                onClick={() => toggleNextCheckpoint(cp.id)}
                                                className="px-2 py-1.5 hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={nextCheckpointIds?.includes(cp.id) || false}
                                                    onChange={() => {}} // Handled by parent div click
                                                    className="w-3 h-3 text-[#1ED5F4] bg-white border-slate-300 rounded focus:ring-[#1ED5F4] focus:ring-1 cursor-pointer"
                                                />
                                                <span className="text-[11px] text-slate-700">
                                                    {cp.title} ({cp.idCode})
                                                </span>
                                            </div>
                                        ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div
                        className={`w-7 h-4 rounded-full relative cursor-pointer transition-colors ${applyToAll ? 'bg-[#1ED5F4]' : 'bg-slate-300'
                            }`}
                        onClick={handleApplyToAllToggle}
                    >
                        <div className={`w-3 h-3 bg-white rounded-full absolute top-[2px] shadow-sm transition-all ${applyToAll ? 'left-[14px]' : 'left-[2px]'
                            }`}></div>
                    </div>
                    <span className="text-[11px] text-slate-500">Apply settings to all stations</span>
                </div>

                <hr className="border-slate-100 my-0.5" />

                <div className="flex justify-between items-center text-[#1ED5F4]">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                        <ListTree size={11} />
                        <span>Active Stations</span>
                    </div>
                    <div
                        className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:text-[#1ac1de]"
                        onClick={() => setShowAddStation(!showAddStation)}
                    >
                        <PlusCircle size={11} />
                        <span>Add Station</span>
                    </div>
                </div>

                {/* Add Station Form */}
                {showAddStation && (
                    <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex flex-col gap-2.5">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-700">New Station</span>
                            <X
                                size={12}
                                className="cursor-pointer text-slate-400 hover:text-slate-600"
                                onClick={() => setShowAddStation(false)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Station ID</label>
                                <input
                                    type="text"
                                    value={newStation.id}
                                    onChange={(e) => setNewStation({ ...newStation, id: e.target.value })}
                                    placeholder="e.g., ST-01"
                                    className="bg-white border border-slate-200 rounded px-1.5 h-6 text-[11px] text-slate-700 outline-none focus:border-[#1ED5F4] font-mono"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Name</label>
                                <input
                                    type="text"
                                    value={newStation.name}
                                    onChange={(e) => setNewStation({ ...newStation, name: e.target.value })}
                                    placeholder="e.g., Lane 1"
                                    className="bg-white border border-slate-200 rounded px-1.5 h-6 text-[11px] text-slate-700 outline-none focus:border-[#1ED5F4]"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleAddStation}
                            className="bg-[#1ED5F4] text-slate-900 text-[10px] font-bold px-2 py-1 rounded hover:bg-[#1ac1de] transition-colors"
                        >
                            Add Station
                        </button>
                    </div>
                )}

                <div className="flex flex-col gap-1.5">
                    {stations.map((s) => (
                        <StationCard
                            key={s.id}
                            id={s.id}
                            name={s.name}
                            checkpointType={currentType}
                            settings={s.settings}
                            onSettingsChange={(settings) => handleStationSettingsChange(s.id, settings)}
                            onDelete={() => handleDeleteStation(s.id)}
                        />
                    ))}
                </div>

            </div>
        </div>
    );
}