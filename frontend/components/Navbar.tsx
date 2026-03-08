'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plane, Settings, Bell } from 'lucide-react';

export default function Navbar() {
    const pathname = usePathname();

    const navItems = [
        { name: 'Config', icon: Settings, path: '/' },
        { name: 'Flights', icon: Plane, path: '/active-flights' },
    ];

    return (
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-50 relative font-sans">

            {/* Left: Animated Logo & Navigation */}
            <div className="flex items-center gap-8">

                {/* Logo Container: Fixed width for the pass-through effect */}
                <div className="relative w-[280px] h-12 flex items-center overflow-hidden border-r border-slate-200 pr-6">

                    {/* 1. The Text Layer (Vanish Effect) */}
                    <div className="absolute left-14 flex flex-col animate-text-vanish z-10">
                        <span className="text-xl font-black text-[#1E3A8A] tracking-widest leading-none italic">
                            AEROTWIN
                        </span>
                        <span className="text-[9px] font-extrabold text-blue-600 tracking-[0.15em] uppercase mt-1">
                            Flight Management System
                        </span>
                    </div>

                    {/* 2. The Plane Layer (Horizontal Sweep) */}
                    <div className="absolute left-0 z-20 animate-plane-pass flex items-center">
                        <Plane
                            size={32}
                            className="text-[#1E3A8A] animate-plane-float"
                            strokeWidth={2.5}
                            fill="currentColor"
                        />
                    </div>
                </div>

                {/* Navigation Links */}
                <nav className="flex items-center gap-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.path;
                        return (
                            <Link
                                key={item.name}
                                href={item.path}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all tracking-wide ${isActive
                                    ? 'bg-blue-50 text-blue-600 shadow-sm border border-blue-100'
                                    : 'text-slate-500 border border-transparent hover:text-slate-800 hover:bg-slate-50'
                                    }`}
                            >
                                <item.icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            {/* Right: Status & User (Search removed) */}
            <div className="flex items-center gap-5">
                <div className="hidden lg:flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse"></div>
                    <span className="text-[9px] font-bold text-emerald-600 tracking-widest uppercase">
                        System Online
                    </span>
                </div>

                <div className="flex items-center gap-4 border-l border-slate-200 pl-5">
                    <Bell size={18} className="text-slate-400 cursor-pointer hover:text-slate-600 transition-colors" />
                    <div className="w-8 h-8 rounded-full bg-[#1E3A8A] flex items-center justify-center text-white text-xs font-bold shadow-sm cursor-pointer">
                        JD
                    </div>
                </div>
            </div>

        </header>
    );
}