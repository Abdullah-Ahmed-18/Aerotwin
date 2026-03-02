'use client';

import { Plus, ShieldHalf, Ticket, X, TicketsPlane, ShoppingBag, QrCode, BaggageClaim, BriefcaseConveyorBelt, ShieldUser, Send, Loader2 } from 'lucide-react';
import CheckpointCard from './CheckpointCard';
import { useState } from 'react';

// Make sure your interfaces are exported so page.tsx can use them
export interface StationSettings {
    staffing: string;
    avgServiceTime: string;
    maxQueue: string;
    experience: string;
    allowedClass: string[];
    hasXRayScanner: boolean;
}

export interface Checkpoint {
    id: string;
    title: string;
    idCode: string;
    type: string;
    colorType: 'security' | 'checkin';
    icon: React.ElementType;
    stations: { id: string; name: string; settings?: StationSettings }[];
    nextCheckpointIds?: string[];
}

interface SidebarProps {
    checkpoints: Checkpoint[];
    setCheckpoints: React.Dispatch<React.SetStateAction<Checkpoint[]>>;
}
// Notice the checkpoints = [] default value!
// Notice the checkpoints = [] default value!
export default function ConfigurationSidebar({ checkpoints = [], setCheckpoints }: SidebarProps) {

    const [showAddForm, setShowAddForm] = useState(false);
    const [newCheckpoint, setNewCheckpoint] = useState({
        title: '',
        idCode: '',
        type: 'Security'
    });
    const [isFormatting, setIsFormatting] = useState(false);
    const [formatStatus, setFormatStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

    const handleDeleteCheckpoint = (id: string) => {
        setCheckpoints(checkpoints.filter(cp => cp.id !== id));
    };

    const handleFormatAndSend = async () => {
        if (checkpoints.length === 0) {
            setFormatStatus({ type: 'error', message: 'Please create at least one checkpoint first' });
            return;
        }

        setIsFormatting(true);
        setFormatStatus({ type: null, message: '' });

        try {
            // Format checkpoint data to match backend expectations
            const formattedData = checkpoints.map(cp => ({
                id: cp.idCode,
                title: cp.title,
                idCode: cp.idCode,
                type: cp.type,
                stations: cp.stations.map(station => {
                    // Preserve full station structure, including tasks if present
                    const stationData: any = {
                        id: station.id,
                        name: station.name,
                    };
                    
                    // Add settings fields if they exist
                    if (station.settings) {
                        stationData.staffing = parseInt(station.settings.staffing) || 1;
                        stationData.avgServiceTime = parseInt(station.settings.avgServiceTime) || 60;
                        stationData.maxQueue = parseInt(station.settings.maxQueue) || 30;
                        stationData.experience = parseFloat(station.settings.experience) || 1.0;
                        stationData.allowedClass = station.settings.allowedClass;
                        stationData.hasXRayScanner = station.settings.hasXRayScanner ? 1 : 0;
                    }
                    
                    return stationData;
                }),
                nextCheckpointIds: cp.nextCheckpointIds || []
            }));

            console.log('Sending formatted data:', formattedData);

            // Send to backend
            const response = await fetch('http://localhost:5000/api/format-aerotwin-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formattedData),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            // Trigger file download
            if (result.success && result.data) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                const filename = `AerotwinConfig_${timestamp}.json`;
                
                // Create blob and download
                const jsonString = JSON.stringify(result.data, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
            
            setFormatStatus({
                type: 'success',
                message: `✅ Successfully formatted and downloaded configuration! Checkpoints: ${checkpoints.length}`
            });

            console.log('Formatted response:', result);
        } catch (error) {
            console.error('Format and send error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            setFormatStatus({
                type: 'error',
                message: `❌ ${errorMessage}. Make sure backend is running on localhost:5000`
            });
        } finally {
            setIsFormatting(false);
        }
    };

    const handleUpdateNextCheckpoints = (id: string, nextCheckpointIds: string[] | undefined) => {
        setCheckpoints(checkpoints.map(cp =>
            cp.id === id ? { ...cp, nextCheckpointIds } : cp
        ));
    };

    const handleUpdateCheckpoint = (id: string, updatedStations: { id: string; name: string; settings?: StationSettings }[]) => {
        // INSIDE handleAddCheckpoint: 
        // Assign icon AND a specific color based on checkpoint type
        let icon;
        let colorType = 'cyan'; // default

        switch (newCheckpoint.type) {
            case 'Security':
                icon = ShieldHalf; colorType = 'amber'; break;
            case 'Check-in /w Baggage Tagging':
                icon = TicketsPlane; colorType = 'blue'; break;
            case 'Digital Check-in':
                icon = QrCode; colorType = 'cyan'; break;
            case 'Self-Service Bag Drop':
                icon = BaggageClaim; colorType = 'purple'; break;
            case 'Baggage Retrieval':
                icon = BriefcaseConveyorBelt; colorType = 'emerald'; break;
            case 'Passport Check':
                icon = ShieldUser; colorType = 'rose'; break;
            default:
                icon = Ticket; colorType = 'slate';
        }

        const checkpoint: Checkpoint = {
            id: `cp-${Date.now()}`,
            title: newCheckpoint.title,
            idCode: newCheckpoint.idCode,
            type: newCheckpoint.type,
            colorType: colorType as any, // Cast it so the interface accepts our new colors
            icon: icon,
            stations: []
        };
        setCheckpoints(checkpoints.map(cp =>
            cp.id === id ? { ...cp, stations: updatedStations } : cp
        ));
    };

    const handleAddCheckpoint = () => {
        if (!newCheckpoint.title || !newCheckpoint.idCode) {
            alert('Please fill in all required fields');
            return;
        }

        const duplicateTitle = checkpoints.some(cp => cp.title.toLowerCase() === newCheckpoint.title.toLowerCase());
        const duplicateId = checkpoints.some(cp => cp.idCode.toLowerCase() === newCheckpoint.idCode.toLowerCase());

        if (duplicateTitle) {
            alert('A checkpoint with this title already exists');
            return;
        }
        if (duplicateId) {
            alert('A checkpoint with this ID already exists');
            return;
        }

        const securityTypes = ['Security', 'Passport Check'];
        const colorType = securityTypes.includes(newCheckpoint.type) ? 'security' : 'checkin';

        let icon;
        switch (newCheckpoint.type) {
            case 'Security': icon = ShieldHalf; break;
            case 'Check-in /w Baggage Tagging': icon = TicketsPlane; break;
            case 'Digital Check-in': icon = QrCode; break;
            case 'Self-Service Bag Drop': icon = BaggageClaim; break;
            case 'Baggage Retrieval': icon = BriefcaseConveyorBelt; break;
            case 'Passport Check': icon = ShieldUser; break;
            default: icon = Ticket;
        }

        const checkpoint: Checkpoint = {
            id: `cp-${Date.now()}`,
            title: newCheckpoint.title,
            idCode: newCheckpoint.idCode,
            type: newCheckpoint.type,
            colorType: colorType,
            icon: icon,
            stations: []
        };

        setCheckpoints([...checkpoints, checkpoint]);
        setNewCheckpoint({ title: '', idCode: '', type: 'Security' });
    };

    return (
        <div className="flex flex-col w-full h-full gap-2 overflow-hidden">
            <div className="flex-shrink-0">
                <h1 className="text-[#1E293B] text-xl font-bold leading-tight">
                    Checkpoint Configuration
                </h1>
                <p className="text-slate-500 text-sm mt-0.5">
                    Define operational nodes and processing stations.
                </p>
            </div>

            {!showAddForm && (
                <button
                    onClick={() => setShowAddForm(true)}
                    className="bg-[#1ED5F4] text-slate-900 text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 w-max hover:bg-[#1ac1de] transition-colors shadow-sm flex-shrink-0"
                >
                    <Plus size={14} strokeWidth={3} />
                    Add Checkpoint
                </button>
            )}

            {showAddForm && (
                <div className="bg-white border border-slate-200 rounded shadow-sm p-3 flex flex-col gap-2.5 flex-shrink-0">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-700">New Checkpoint</span>
                        <X
                            size={16}
                            className="cursor-pointer text-slate-400 hover:text-slate-600"
                            onClick={() => setShowAddForm(false)}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Title</label>
                        <input
                            type="text"
                            value={newCheckpoint.title}
                            onChange={(e) => setNewCheckpoint({ ...newCheckpoint, title: e.target.value })}
                            placeholder="e.g., Security Checkpoint A"
                            className="bg-slate-100 border border-slate-200 rounded px-2 h-7 text-xs text-slate-700 outline-none focus:border-[#1ED5F4]"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">ID Code</label>
                        <input
                            type="text"
                            value={newCheckpoint.idCode}
                            onChange={(e) => setNewCheckpoint({ ...newCheckpoint, idCode: e.target.value })}
                            placeholder="e.g., CP-SEC-01"
                            className="bg-slate-100 border border-slate-200 rounded px-2 h-7 text-xs text-slate-700 outline-none focus:border-[#1ED5F4] font-mono"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Type</label>
                        <select
                            value={newCheckpoint.type}
                            onChange={(e) => setNewCheckpoint({ ...newCheckpoint, type: e.target.value })}
                            className="bg-slate-100 border border-slate-200 rounded px-2 h-7 text-xs text-slate-700 outline-none focus:border-[#1ED5F4]"
                        >
                            <option value="Security">Security</option>
                            <option value="Check-in /w Baggage Tagging">Check-in /w Baggage Tagging</option>
                            <option value="Digital Check-in">Digital Check-in</option>
                            <option value="Self-Service Bag Drop">Self-Service Bag Drop</option>
                            <option value="Baggage Retrieval">Baggage Retrieval</option>
                            <option value="Passport Check">Passport Check</option>
                        </select>
                    </div>
                    <button
                        onClick={handleAddCheckpoint}
                        className="bg-[#1ED5F4] text-slate-900 text-xs font-bold px-3 py-1.5 rounded hover:bg-[#1ac1de] transition-colors"
                    >
                        Create Checkpoint
                    </button>
                </div>
            )}

            <div className="flex flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1 flex-1 min-h-0 custom-scrollbar">
                {checkpoints.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-sm">
                        No checkpoints configured. Click &quot;Add Checkpoint&quot; to create one.
                    </div>
                ) : (
                    checkpoints.map((checkpoint) => (
                        <CheckpointCard
                            key={checkpoint.id}
                            id={checkpoint.id}
                            title={checkpoint.title}
                            idCode={checkpoint.idCode}
                            type={checkpoint.type}
                            colorType={checkpoint.colorType}
                            icon={checkpoint.icon}
                            stations={checkpoint.stations}
                            nextCheckpointIds={checkpoint.nextCheckpointIds}
                            checkpoints={checkpoints}
                            onDelete={handleDeleteCheckpoint}
                            onUpdateStations={handleUpdateCheckpoint}
                            onUpdateNextCheckpoints={handleUpdateNextCheckpoints}
                        />
                    ))
                )}
            </div>

            {/* Status Message */}
            {formatStatus.type && (
                <div className={`px-3 py-2 rounded text-xs font-medium text-white flex-shrink-0 ${
                    formatStatus.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
                }`}>
                    {formatStatus.message}
                </div>
            )}

            {/* Format & Send Button */}
            <button
                onClick={handleFormatAndSend}
                disabled={isFormatting}
                className="bg-gradient-to-r from-[#1ED5F4] to-[#00A8D8] text-slate-900 text-xs font-bold px-3 py-2 rounded flex items-center justify-center gap-2 w-full hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
                {isFormatting ? (
                    <>
                        <Loader2 size={14} className="animate-spin" />
                        Formatting...
                    </>
                ) : (
                    <>
                        <Send size={14} strokeWidth={2.5} />
                        Format & Send Config
                    </>
                )}
            </button>
        </div>
    );
}