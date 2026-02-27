import { ChevronDown } from 'lucide-react';

interface StationProps {
    id: string;
    name: string;
}

export default function StationCard({ id, name }: StationProps) {
    return (
        <div className="bg-slate-50 rounded p-1.5 border border-slate-200">
            <div className="flex items-center gap-1 mb-1">
                <div className="w-1 h-1 rounded-full bg-[#00D084]" />
                <span className="text-[7px] font-semibold text-slate-500 uppercase tracking-wide">{id}</span>
                <span className="text-[8px] font-bold text-slate-800">{name}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-1.5 gap-y-1">
                <div className="flex flex-col">
                    <label className="text-[6px] font-bold text-slate-400 uppercase tracking-wider">Staffing #</label>
                    <input
                        type="text"
                        className="bg-white border border-slate-200 rounded px-1 h-[18px] text-[8px] text-slate-700 outline-none"
                        placeholder="3"
                    />
                </div>

                <div className="flex flex-col">
                    <label className="text-[6px] font-bold text-slate-400 uppercase tracking-wider">Avg Svc Time</label>
                    <div className="relative">
                        <input
                            type="text"
                            className="w-full bg-white border border-slate-200 rounded pl-1 pr-4 h-[18px] text-[8px] text-slate-700 outline-none"
                            placeholder="45"
                        />
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[7px] text-slate-400 pointer-events-none">sec</span>
                    </div>
                </div>

                <div className="flex flex-col">
                    <label className="text-[6px] font-bold text-slate-400 uppercase tracking-wider">Max Queue</label>
                    <input
                        type="text"
                        className="bg-white border border-slate-200 rounded px-1 h-[18px] text-[8px] text-slate-700 outline-none"
                        placeholder="50"
                    />
                </div>

                <div className="flex flex-col">
                    <label className="text-[6px] font-bold text-slate-400 uppercase tracking-wider">Staffing Experience</label>
                    <div className="relative">
                        <select className="w-full bg-white border border-slate-200 rounded pl-1 pr-3 h-[18px] text-[8px] text-slate-700 appearance-none outline-none">
                            <option>Veteran</option>
                        </select>
                        <ChevronDown size={6} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                <div className="col-span-2 flex flex-col">
                    <label className="text-[6px] font-bold text-slate-400 uppercase tracking-wider">Allowed Class</label>
                    <div className="relative">
                        <select className="w-full bg-white border border-slate-200 rounded pl-1 pr-3 h-[18px] text-[8px] text-slate-700 appearance-none outline-none">
                            <option>All Classes</option>
                        </select>
                        <ChevronDown size={6} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>
    );
}