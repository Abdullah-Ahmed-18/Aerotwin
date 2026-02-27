import { Settings, Bell, ChevronDown } from 'lucide-react'; // You may need to run: npm install lucide-react

export default function Navbar() {
    return (
        <nav className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
            {/* Left: Logo & Title */}
            <div className="flex items-center gap-3">
                <div className="text-blue-900 font-bold text-xl tracking-tighter flex items-center gap-2">
                    <span className="text-2xl">✈</span> AEROTWIN
                </div>
                <span className="text-xs text-gray-400 font-medium mt-1 uppercase tracking-widest">
                    Configuration System v2.4
                </span>
            </div>

            {/* Right: Status & Actions */}
            <div className="flex items-center gap-6">
                {/* System Status */}
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-bold text-blue-900 uppercase">System Online</span>
                </div>

                {/* Icons */}
                <div className="flex items-center gap-4 text-gray-500">
                    <Settings className="w-5 h-5 cursor-pointer hover:text-blue-600" />
                    <Bell className="w-5 h-5 cursor-pointer hover:text-blue-600" />
                </div>

                {/* User Profile */}
                <div className="flex items-center gap-2 border-l pl-4 border-gray-200">
                    <div className="w-8 h-8 bg-blue-900 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        JD
                    </div>
                </div>
            </div>
        </nav>
    );
}