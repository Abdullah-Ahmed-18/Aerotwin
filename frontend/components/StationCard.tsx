import { ChevronDown } from 'lucide-react';

interface StationProps {
    id: string;
    name: string;
}

export default function StationCard({ id, name }: StationProps) {
    return (
        <div className="bg-[#F1F5F9] rounded-sm p-2 mb-1 border border-gray-200">
            {/* Station Title & Status */}
            <div className="flex items-center gap-1.5 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">{id}</span>
                <span className="text-[10px] font-bold text-slate-700">{name}</span>
            </div>

            {/* Grid: 5 Input Boxes - Compact & Aligned */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div className="flex flex-col">
                    <label className="text-[7px] font-bold text-gray-400 uppercase">Staffing #</label>
                    <input type="text" className="h-5 bg-white border border-gray-200 rounded px-1 text-[9px] outline-none" placeholder="3" />
                </div>
                <div className="flex flex-col">
                    <label className="text-[7px] font-bold text-gray-400 uppercase">Avg Svc Time</label>
                    <div className="relative">
                        <input type="text" className="w-full h-5 bg-white border border-gray-200 rounded px-1 text-[9px] outline-none" placeholder="45" />
                        <span className="absolute right-1 top-0.5 text-[7px] text-gray-400">sec</span>
                    </div>
                </div>
                <div className="flex flex-col">
                    <label className="text-[7px] font-bold text-gray-400 uppercase">Max Queue</label>
                    <input type="text" className="h-5 bg-white border border-gray-200 rounded px-1 text-[9px] outline-none" placeholder="50" />
                </div>
                <div className="flex flex-col">
                    <label className="text-[7px] font-bold text-gray-400 uppercase">Experience</label>
                    <div className="relative">
                        <select className="w-full h-5 bg-white border border-gray-200 rounded px-1 text-[9px] appearance-none outline-none">
                            <option>Veteran</option>
                        </select>
                        <ChevronDown size={8} className="absolute right-1 top-1.5 text-gray-400 pointer-events-none" />
                    </div>
                </div>
                <div className="col-span-2 flex flex-col">
                    <label className="text-[7px] font-bold text-gray-400 uppercase">Allowed Class</label>
                    <div className="relative">
                        <select className="w-full h-5 bg-white border border-gray-200 rounded px-1 text-[9px] appearance-none outline-none">
                            <option>All Classes</option>
                        </select>
                        <ChevronDown size={8} className="absolute right-1 top-1.5 text-gray-400 pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>
    );
}