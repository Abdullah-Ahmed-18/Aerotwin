import { LayoutGrid, PlusCircle, Activity, Database, ShieldCheck } from 'lucide-react';

export default function Sidebar() {
    const menuItems = [
        { icon: LayoutGrid, label: 'Dashboard', active: false },
        { icon: ShieldCheck, label: 'Checkpoints', active: true },
        { icon: Database, label: 'Data Logs', active: false },
        { icon: Activity, label: 'Simulation', active: false },
    ];

    return (
        <aside className="w-64 h-[calc(100vh-64px)] bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 space-y-2">
                {menuItems.map((item) => (
                    <div
                        key={item.label}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors ${item.active
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                    >
                        <item.icon size={20} />
                        <span className="font-medium text-sm">{item.label}</span>
                    </div>
                ))}
            </div>

            <div className="mt-auto p-4 border-t border-gray-100">
                <button className="flex items-center gap-2 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-semibold">
                    <PlusCircle size={18} />
                    Add Checkpoint
                </button>
            </div>
        </aside>
    );
}