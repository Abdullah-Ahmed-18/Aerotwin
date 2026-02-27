import { Edit2, Trash2, ListTree, PlusCircle, ChevronDown, Plus } from 'lucide-react';
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
    const leftBorder = colorType === 'security' ? 'border-l-amber-500' : 'border-l-[#1E3A8A]';
    const iconColor = colorType === 'security' ? 'text-amber-500' : 'text-[#1E3A8A]';

    return (
        <div className={`bg-white border-l-[3px] ${leftBorder} rounded shadow-sm border border-slate-200 flex flex-col`}>

            <div className="px-2 py-1.5 flex justify-between items-center border-b border-slate-50">
                <div className="flex items-center gap-1.5">
                    <Icon size={12} className={iconColor} />
                    <span className="text-[11px] font-bold text-slate-900">{title}</span>
                </div>
                <div className="flex gap-2 text-slate-300">
                    <Edit2 size={10} className="cursor-pointer hover:text-slate-500" />
                    <Trash2 size={10} className="cursor-pointer hover:text-red-500" />
                </div>
            </div>

            <div className="p-2 flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">ID Code</label>
                        <input
                            defaultValue={idCode}
                            className="bg-slate-100 border border-transparent rounded px-1.5 h-5 text-[9px] text-slate-700 outline-none font-mono"
                        />
                    </div>
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">Type</label>
                        <div className="relative">
                            <select
                                defaultValue={type}
                                className="w-full bg-slate-100 border border-transparent rounded pl-1.5 pr-4 h-5 text-[9px] text-slate-700 outline-none appearance-none"
                            >
                                <option value={type}>{type}</option>
                            </select>
                            <ChevronDown size={8} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <div className="w-5 h-3 bg-slate-300 rounded-full relative cursor-pointer">
                        <div className="w-2 h-2 bg-white rounded-full absolute left-[2px] top-[2px] shadow-sm"></div>
                    </div>
                    <span className="text-[8px] text-slate-500">Apply settings to all stations</span>
                </div>

                <hr className="border-slate-100 my-0.5" />

                <div className="flex justify-between items-center text-[#1ED5F4]">
                    <div className="flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider">
                        <ListTree size={8} />
                        <span>Active Stations</span>
                    </div>
                    <div className="flex items-center gap-1 text-[7px] cursor-pointer">
                        <PlusCircle size={8} />
                        <span>Add Station</span>
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    {stations.map((s) => (
                        <StationCard key={s.id} id={s.id} name={s.name} />
                    ))}
                </div>

                <div className="w-full h-5 border border-dashed border-slate-200 bg-slate-50/50 rounded flex items-center gap-1 text-slate-400 text-[8px] font-medium cursor-pointer">
                    <Plus size={8} className="ml-1.5" />
                    Configure new station parameter block...
                </div>
            </div>
        </div>
    );
}