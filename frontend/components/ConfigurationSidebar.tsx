'use client';

import { Plus, ShieldHalf, Ticket, X, TicketsPlane, ShoppingBag, QrCode, BaggageClaim, BriefcaseConveyorBelt, ShieldUser } from 'lucide-react';
import CheckpointCard from './CheckpointCard';
import { useState } from 'react';

interface StationSettings {
    staffing: string;
    avgServiceTime: string;
    maxQueue: string;
    experience: string;
    allowedClass: string[];
    hasXRayScanner: boolean;
}

interface Checkpoint {
    id: string;
    title: string;
    idCode: string;
    type: string;
    colorType: 'security' | 'checkin';
    icon: React.ElementType;
    stations: { id: string; name: string; settings?: StationSettings }[];
}

export default function ConfigurationSidebar() {
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newCheckpoint, setNewCheckpoint] = useState({
        title: '',
        idCode: '',
        type: 'Security'
    });

    const handleDeleteCheckpoint = (id: string) => {
        setCheckpoints(checkpoints.filter(cp => cp.id !== id));
    };

    const handleUpdateCheckpoint = (id: string, updatedStations: { id: string; name: string; settings?: StationSettings }[]) => {
        setCheckpoints(checkpoints.map(cp => 
            cp.id === id ? { ...cp, stations: updatedStations } : cp
        ));
    };

    const handleAddCheckpoint = () => {
        if (!newCheckpoint.title || !newCheckpoint.idCode) {
            alert('Please fill in all required fields');
            return;
        }

        // Check for duplicate checkpoint title or ID
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

        // Auto-determine colorType based on checkpoint type
        const securityTypes = ['Security', 'Passport Check'];
        const colorType = securityTypes.includes(newCheckpoint.type) ? 'security' : 'checkin';

        // Assign icon based on checkpoint type
        let icon;
        switch (newCheckpoint.type) {
            case 'Security':
                icon = ShieldHalf;
                break;
            case 'Check-in /w Baggage Tagging':
                icon = TicketsPlane;
                break;
            case 'Digital Check-in':
                icon = QrCode;
                break;
            case 'Self-Service Bag Drop':
                icon = BaggageClaim;
                break;
            case 'Baggage Retrieval':
                icon = BriefcaseConveyorBelt;
                break;
            case 'Passport Check':
                icon = ShieldUser;
                break;
            default:
                icon = Ticket;
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
        // Don't close the form, just reset fields
        setNewCheckpoint({
            title: '',
            idCode: '',
            type: 'Security'
        });
    };

    return (
        <div className="flex flex-col w-full h-full gap-2 overflow-hidden">
            {/* Header */}
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

            {/* Add Checkpoint Form */}
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

            {/* Checkpoint Cards Container */}
            <div className="flex flex-col gap-2 overflow-y-auto overflow-x-hidden pr-1 flex-1 min-h-0">
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
                            onDelete={handleDeleteCheckpoint}
                            onUpdateStations={handleUpdateCheckpoint}
                        />
                    ))
                )}
            </div>
        </div>
    );
}