import { Handle, Position } from '@xyflow/react';
import { ShieldHalf, Ticket, TicketsPlane, QrCode, BaggageClaim, BriefcaseConveyorBelt, ShieldUser } from 'lucide-react';

// React Flow passes data through a specific 'data' object
export default function PassengerNode({ data }: { data: any }) {
    const { title, idCode, type } = data;

    const getNodeStyle = (nodeType: string) => {
        switch (nodeType) {
            case 'Security':
                return { border: 'border-amber-500', text: 'text-amber-500', icon: ShieldHalf, glow: 'shadow-[0_0_20px_rgba(245,158,11,0.4)] hover:shadow-[0_0_30px_rgba(245,158,11,0.6)]' };
            case 'Check-in /w Baggage Tagging':
                return { border: 'border-blue-500', text: 'text-blue-500', icon: TicketsPlane, glow: 'shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.6)]' };
            case 'Digital Check-in':
                return { border: 'border-[#22D3EE]', text: 'text-[#22D3EE]', icon: QrCode, glow: 'shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:shadow-[0_0_30px_rgba(34,211,238,0.6)]' };
            case 'Self-Service Bag Drop':
                return { border: 'border-purple-500', text: 'text-purple-500', icon: BaggageClaim, glow: 'shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]' };
            case 'Baggage Retrieval':
                return { border: 'border-emerald-500', text: 'text-emerald-500', icon: BriefcaseConveyorBelt, glow: 'shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)]' };
            case 'Passport Check':
                return { border: 'border-rose-500', text: 'text-rose-500', icon: ShieldUser, glow: 'shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:shadow-[0_0_30px_rgba(244,63,94,0.6)]' };
            default:
                return { border: 'border-slate-400', text: 'text-slate-400', icon: Ticket, glow: 'shadow-[0_0_20px_rgba(148,163,184,0.4)] hover:shadow-[0_0_30px_rgba(148,163,184,0.6)]' };
        }
    };

    const style = getNodeStyle(type);
    const Icon = style.icon;

    return (
        <div className="flex flex-col items-center gap-3 w-40">
            {/* Input Handle (Left) */}
            <Handle type="target" position={Position.Left} className={`w-3 h-3 ${style.text.replace('text', 'bg')} border-2 border-gray-900 z-10`} />

            {/* The Glowing Circular Node */}
            <div className={`w-32 h-32 rounded-full bg-gray-900 border-2 ${style.border} ${style.glow} flex items-center justify-center relative cursor-grab active:cursor-grabbing transition-shadow`}>
                <Icon size={48} className={style.text} strokeWidth={1.5} />
            </div>

            {/* Output Handle (Right) */}
            <Handle type="source" position={Position.Right} className={`w-3 h-3 ${style.text.replace('text', 'bg')} border-2 border-gray-900 z-10`} />

            {/* Node Labels */}
            <div className="flex flex-col items-center text-center">
                <span className="text-sm font-bold text-slate-700">{title}</span>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                    {idCode} • {type}
                </span>
            </div>
        </div>
    );
}