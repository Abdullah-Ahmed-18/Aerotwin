import { Plus, Shield, Ticket } from 'lucide-react';
import CheckpointCard from './CheckpointCard';

export default function ConfigurationSidebar() {
    const securityStations = [
        { id: 'ST-01', name: 'Lane 1' },
        { id: 'ST-02', name: 'Lane 2 (Priority)' }
    ];

    const checkinStations = [
        { id: 'ST-01', name: 'Desk 1' }
    ];

    return (
        <div className="flex flex-col w-full h-full gap-1.5">
            {/* Header */}
            <div>
                <h1 className="text-[#1E293B] text-[15px] font-bold leading-tight">
                    Checkpoint Configuration
                </h1>
                <p className="text-slate-500 text-[9px]">
                    Define operational nodes and processing stations.
                </p>
            </div>

            <button className="bg-[#1ED5F4] text-slate-900 text-[9px] font-bold px-2 py-1 rounded flex items-center gap-1 w-max hover:bg-[#1ac1de] transition-colors shadow-sm">
                <Plus size={10} strokeWidth={3} />
                Add Checkpoint
            </button>

            {/* Checkpoint Cards Container */}
            <div className="flex flex-col gap-1.5">
                <CheckpointCard
                    title="Security Checkpoint A"
                    idCode="CP-SEC-01"
                    type="Security Screening"
                    colorType="security"
                    icon={Shield}
                    stations={securityStations}
                />
                <CheckpointCard
                    title="Main Hall Check-in"
                    idCode="CP-CHK-01"
                    type="Check-in Counter"
                    colorType="checkin"
                    icon={Ticket}
                    stations={checkinStations}
                />
            </div>
        </div>
    );
}