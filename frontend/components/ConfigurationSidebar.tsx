'use client';
import { Plus, ShieldHalf, Ticket, X, TicketsPlane, ShoppingBag, QrCode, BaggageClaim, BriefcaseConveyorBelt, ShieldUser, PlaneTakeoff, Armchair, Send, Loader2 } from 'lucide-react';
import CheckpointCard from './CheckpointCard';
import { useRef, useState } from 'react';

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
    seatCapacity?: string;
    nextCheckpointIds?: string[];
}

interface SidebarProps {
    checkpoints: Checkpoint[];
    setCheckpoints: React.Dispatch<React.SetStateAction<Checkpoint[]>>;
}

export default function ConfigurationSidebar({ checkpoints = [], setCheckpoints }: SidebarProps) {

    const [showAddForm, setShowAddForm] = useState(false);
    const [newCheckpoint, setNewCheckpoint] = useState({
        title: '',
        idCode: '',
        type: 'Security'
    });
    const [isFormatting, setIsFormatting] = useState(false);
    const [formatStatus, setFormatStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
    const [showImportConfirmModal, setShowImportConfirmModal] = useState(false);
    const [pendingImportCheckpoints, setPendingImportCheckpoints] = useState<Checkpoint[] | null>(null);
    const [pendingImportCounts, setPendingImportCounts] = useState<{ current: number; incoming: number } | null>(null);
    const importInputRef = useRef<HTMLInputElement | null>(null);

    const getIconForType = (type: string) => {
        switch (type) {
            case 'Arrival Terminal': return Armchair;
            case 'Departing Terminal': return Armchair;
            case 'Security': return ShieldHalf;
            case 'Check-in /w Baggage Tagging': return TicketsPlane;
            case 'Digital Check-in': return QrCode;
            case 'Self-Service Bag Drop': return BaggageClaim;
            case 'Baggage Retrieval': return BriefcaseConveyorBelt;
            case 'Passport Check': return ShieldUser;
            case 'Boarding': return PlaneTakeoff;
            default: return Ticket;
        }
    };

    const getColorTypeForCheckpoint = (type: string): 'security' | 'checkin' => {
        const securityTypes = ['Security', 'Passport Check'];
        return securityTypes.includes(type) ? 'security' : 'checkin';
    };

    const parseExperienceLabel = (rawExperience: unknown): string => {
        const numeric = typeof rawExperience === 'number'
            ? rawExperience
            : parseFloat(String(rawExperience ?? '1'));

        if (!Number.isFinite(numeric)) {
            return 'Experienced';
        }

        if (numeric >= 1.1) {
            return 'Veteran';
        }

        if (numeric <= 0.9) {
            return 'In Training';
        }

        return 'Experienced';
    };

    const handleImportClick = () => {
        importInputRef.current?.click();
    };

    const applyImportedCheckpoints = (imported: Checkpoint[]) => {
        setCheckpoints(imported);
        setFormatStatus({
            type: 'success',
            message: `Successfully imported configuration with ${imported.length} checkpoints`
        });
    };

    const handleConfirmImport = () => {
        if (!pendingImportCheckpoints) {
            setShowImportConfirmModal(false);
            return;
        }

        applyImportedCheckpoints(pendingImportCheckpoints);
        setPendingImportCheckpoints(null);
        setPendingImportCounts(null);
        setShowImportConfirmModal(false);
    };

    const handleCancelImport = () => {
        setPendingImportCheckpoints(null);
        setPendingImportCounts(null);
        setShowImportConfirmModal(false);
        setFormatStatus({
            type: 'error',
            message: 'Import canceled. Existing configuration was kept.'
        });
    };

    const handleImportConfiguration = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        try {
            const text = await file.text();
            const parsed = JSON.parse(text);

            const checkpointSource = Array.isArray(parsed)
                ? parsed
                : Array.isArray(parsed?.Checkpoints)
                    ? parsed.Checkpoints
                    : null;

            if (!checkpointSource) {
                throw new Error('Invalid file format. Expected an Aerotwin config JSON with a Checkpoints array.');
            }

            const importedCheckpoints: Checkpoint[] = checkpointSource.map((cp: any, index: number) => {
                const checkpointType = String(cp.Checkpoint_Type || cp.type || 'Security');
                const idCode = String(cp.Checkpoint_ID || cp.idCode || `CP-${index + 1}`);
                const uiId = `cp-import-${Date.now()}-${index}`;
                const isTerminalType = checkpointType === 'Arrival Terminal' || checkpointType === 'Departing Terminal';
                const stations = Array.isArray(cp.Stations)
                    ? cp.Stations.map((station: any, stationIndex: number) => ({
                        id: String(station.Station_ID || station.id || `ST-${stationIndex + 1}`),
                        name: String(station.Station_ID || station.name || `Station ${stationIndex + 1}`),
                        settings: {
                            staffing: String(station.Staffing_No ?? station.staffing ?? ''),
                            avgServiceTime: String(station.Avg_Service_Time ?? station.avgServiceTime ?? ''),
                            maxQueue: String(station.Max_Queue_Cap ?? station.maxQueue ?? ''),
                            experience: parseExperienceLabel(station.Efficiency_Factor ?? station.experience),
                            allowedClass: Array.isArray(station.Allowed_Class || station.allowedClass)
                                ? (station.Allowed_Class || station.allowedClass)
                                : ['All Classes'],
                            hasXRayScanner: Number(station.Feature_Val ?? station.hasXRayScanner ?? 0) === 1
                        }
                    }))
                    : [];

                return {
                    id: uiId,
                    title: String(cp.title || cp.Checkpoint_ID || `${checkpointType} ${index + 1}`),
                    idCode,
                    type: checkpointType,
                    colorType: getColorTypeForCheckpoint(checkpointType),
                    icon: getIconForType(checkpointType),
                    stations,
                    seatCapacity: isTerminalType
                        ? String(
                            cp.Seat_Capacity
                            ?? cp.seatCapacity
                            ?? cp.Stations?.[0]?.Max_Queue_Cap
                            ?? cp.Stations?.[0]?.maxQueue
                            ?? ''
                        )
                        : undefined,
                    nextCheckpointIds: []
                };
            });

            const idCodeToUiId = new Map(importedCheckpoints.map(cp => [cp.idCode, cp.id]));

            const checkpointsWithLinks = importedCheckpoints.map((cp, index) => {
                const sourceCheckpoint = checkpointSource[index];
                const nextAnchors = sourceCheckpoint?.Next_Anchor;
                const mappedNextCheckpointIds = Array.isArray(nextAnchors)
                    ? nextAnchors
                        .map((nextId: string) => idCodeToUiId.get(nextId))
                        .filter((id: string | undefined): id is string => Boolean(id))
                    : [];

                return {
                    ...cp,
                    nextCheckpointIds: mappedNextCheckpointIds.length > 0 ? mappedNextCheckpointIds : undefined
                };
            });

            if (checkpoints.length > 0) {
                setPendingImportCheckpoints(checkpointsWithLinks);
                setPendingImportCounts({
                    current: checkpoints.length,
                    incoming: checkpointsWithLinks.length
                });
                setShowImportConfirmModal(true);
                setFormatStatus({ type: null, message: '' });
                return;
            }

            applyImportedCheckpoints(checkpointsWithLinks);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to import configuration';
            setFormatStatus({
                type: 'error',
                message
            });
        } finally {
            event.target.value = '';
        }
    };

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
            const formattedData = checkpoints.map(cp => {
                const isTerminalType = cp.type === 'Arrival Terminal' || cp.type === 'Departing Terminal';

                if (isTerminalType) {
                    const seatCount = parseInt(cp.seatCapacity || '', 10) || 0;
                    return {
                        id: cp.id,
                        title: cp.title,
                        idCode: cp.idCode,
                        type: cp.type,
                        stations: [
                            {
                                id: 'SEAT-CAPACITY',
                                name: 'Seat Capacity',
                                staffing: 0,
                                avgServiceTime: 0,
                                maxQueue: seatCount,
                                experience: 1.0,
                                allowedClass: ['All Classes'],
                                hasXRayScanner: 0
                            }
                        ],
                        nextCheckpointIds: cp.nextCheckpointIds || []
                    };
                }

                return {
                    id: cp.id,
                    title: cp.title,
                    idCode: cp.idCode,
                    type: cp.type,
                    stations: cp.stations.map(station => {
                        const stationData: any = {
                            id: station.id,
                            name: station.name,
                        };

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
                };
            });

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
        setCheckpoints(checkpoints.map(cp =>
            cp.id === id ? { ...cp, stations: updatedStations } : cp
        ));
    };

    const handleUpdateCheckpointMeta = (id: string, updates: Partial<Pick<Checkpoint, 'type' | 'seatCapacity'>>) => {
        setCheckpoints(checkpoints.map(cp =>
            cp.id === id
                ? {
                    ...cp,
                    ...updates,
                    icon: updates.type ? getIconForType(updates.type) : cp.icon,
                    colorType: updates.type ? getColorTypeForCheckpoint(updates.type) : cp.colorType
                }
                : cp
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

        const colorType = getColorTypeForCheckpoint(newCheckpoint.type);
        const icon = getIconForType(newCheckpoint.type);

        const checkpoint: Checkpoint = {
            id: `cp-${Date.now()}`,
            title: newCheckpoint.title,
            idCode: newCheckpoint.idCode,
            type: newCheckpoint.type,
            colorType: colorType as any,
            icon: icon,
            stations: [],
            seatCapacity: newCheckpoint.type === 'Arrival Terminal' || newCheckpoint.type === 'Departing Terminal' ? '' : undefined
        };

        setCheckpoints([...checkpoints, checkpoint]);
        setNewCheckpoint({ title: '', idCode: '', type: 'Security' });
    };

    return (
        <>
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
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="bg-[#1ED5F4] text-slate-900 text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 w-max hover:bg-[#1ac1de] transition-colors shadow-sm flex-shrink-0"
                    >
                        <Plus size={14} strokeWidth={3} />
                        Add Checkpoint
                    </button>
                    <button
                        onClick={handleImportClick}
                        className="bg-white border border-slate-300 text-slate-700 text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1.5 w-max hover:bg-slate-50 transition-colors shadow-sm flex-shrink-0"
                    >
                        Import Configuration
                    </button>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={handleImportConfiguration}
                    />
                </div>
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
                            <option value="Arrival Terminal">Arrival Terminal</option>
                            <option value="Departing Terminal">Departing Terminal</option>
                            <option value="Security">Security</option>
                            <option value="Check-in /w Baggage Tagging">Check-in /w Baggage Tagging</option>
                            <option value="Digital Check-in">Digital Check-in</option>
                            <option value="Self-Service Bag Drop">Self-Service Bag Drop</option>
                            <option value="Baggage Retrieval">Baggage Retrieval</option>
                            <option value="Passport Check">Passport Check</option>
                            <option value="Boarding">Boarding</option>
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
                            seatCapacity={checkpoint.seatCapacity}
                            nextCheckpointIds={checkpoint.nextCheckpointIds}
                            checkpoints={checkpoints}
                            onDelete={handleDeleteCheckpoint}
                            onUpdateStations={handleUpdateCheckpoint}
                            onUpdateCheckpointMeta={handleUpdateCheckpointMeta}
                            onUpdateNextCheckpoints={handleUpdateNextCheckpoints}
                        />
                    ))
                )}
            </div>



            {/* Status Message */}
            {formatStatus.type && (
                <div className={`px-3 py-2 rounded text-xs font-medium text-white flex-shrink-0 mt-2 ${
                    formatStatus.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
                }`}>
                    {formatStatus.message}
                </div>
            )}

            {/* Format & Send Button */}
            <button
                onClick={handleFormatAndSend}
                disabled={isFormatting}
                className="bg-gradient-to-r from-[#1ED5F4] to-[#00A8D8] text-slate-900 text-xs font-bold px-3 py-2 rounded flex items-center justify-center gap-2 w-full hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 mt-2"
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
        {showImportConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
                    <h2 className="text-sm font-bold text-slate-900">Replace Existing Configuration?</h2>
                    <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                        This import will replace your current {pendingImportCounts?.current ?? 0} checkpoint(s)
                        with {pendingImportCounts?.incoming ?? 0} checkpoint(s).
                    </p>

                    <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                            onClick={handleCancelImport}
                            className="px-3 py-1.5 text-xs font-bold rounded border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirmImport}
                            className="px-3 py-1.5 text-xs font-bold rounded bg-[#1ED5F4] text-slate-900 hover:bg-[#1ac1de] transition-colors"
                        >
                            Replace & Import
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}