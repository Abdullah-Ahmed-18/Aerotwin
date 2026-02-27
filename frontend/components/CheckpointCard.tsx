import { Edit2, Trash2, ListTree, PlusCircle } from 'lucide-react';
import StationCard from './StationCard';

interface CheckpointProps {
    title: string;
    idCode: string;
    type: string;
    colorType: 'security' | 'checkin';
    icon: React.ElementType;
    stations: { id: string; name: string }[];
}

export default function CheckpointCard({ title, idCode, type, colorType, icon: Icon, stations }: CheckpointProps) {
    const leftBorder = colorType === 'security' ? 'border-l-amber-500' : 'border-l-blue-900';
    const iconColor = colorType === 'security' ? 'text-amber-500' : 'text-blue-900';

    return (
        <div className={`bg-white border-l-4 ${leftBorder} rounded-sm shadow-sm border border-gray-200`}>
            <div className="px-2 py-1.5 border-b border-gray-50 flex justify-between items-center">
                <div className={`flex items-center gap-1.5 font-bold text-[10px] ${iconColor}`}>
                    <Icon size={12} />
                    <span className="text-slate-800">{title}</span>
                </div>
                <div className="flex gap-1.5 text-gray-300">
                    <Edit2 size={10} className="cursor-pointer" />
                    <Trash2 size={10} className="cursor-pointer" />
                </div>
            </div>

            <div className="p-2 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-left">
                    <div className="flex flex-col">
                        <label className="text-[7px] font-bold text-gray-400 uppercase">ID Code</label>
                        <input defaultValue={idCode} className="bg-[#F1F5F9] rounded px-1.5 py-1 text-[9px] outline-none" />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-[7px] font-bold text-gray-400 uppercase">Type</label>
                        <input defaultValue={type} className="bg-[#F1F5F9] rounded px-1.5 py-1 text-[9px] outline-none" />
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between items-center text-cyan-400 text-[8px] font-bold uppercase tracking-wider">
                        <div className="flex items-center gap-1"><ListTree size={10} /> Active Stations</div>
                        <div className="flex items-center gap-0.5 cursor-pointer"><PlusCircle size={9} /> Add</div>
                    </div>
                    {stations.map((s) => (
                        <StationCard key={s.id} id={s.id} name={s.name} />
                    ))}
                </div>
            </div>
        </div>
    );
}