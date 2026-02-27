import { Plus, ShieldCheck, Ticket } from 'lucide-react';
import CheckpointCard from '@/components/CheckpointCard';

export default function Home() {
  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] p-3 space-y-2 overflow-hidden">
      <div>
        <h1 className="text-[16px] font-bold text-slate-900 leading-tight">Checkpoint Configuration</h1>
        <p className="text-[9px] text-gray-400 font-medium">Define operational nodes and processing stations.</p>
        <button className="mt-2 flex items-center gap-1 bg-cyan-400 text-slate-900 font-bold py-1 px-2 rounded text-[9px] uppercase tracking-wider transition-all">
          <Plus size={12} strokeWidth={3} />
          Add Checkpoint
        </button>
      </div>

      {/* Cards List - No Scroll Area */}
      <div className="space-y-2">
        <CheckpointCard
          title="Security Checkpoint A"
          idCode="CP-SEC-01"
          type="Security Screening"
          colorType="security"
          icon={ShieldCheck}
          stations={[
            { id: "ST-01", name: "Lane 1" },
            { id: "ST-02", name: "Lane 2 (Priority)" }
          ]}
        />

        <CheckpointCard
          title="Main Hall Check-in"
          idCode="CP-CHK-01"
          type="Check-in Counter"
          colorType="checkin"
          icon={Ticket}
          stations={[
            { id: "ST-01", name: "Desk 1" }
          ]}
        />
      </div>
    </div>
  );
}