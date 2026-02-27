import './globals.css';
import Navbar from '@/components/Navbar'; // Make sure you have this component!

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white antialiased h-screen flex flex-col overflow-hidden">
        <Navbar />

        <div className="flex flex-1 min-h-0">

          {/* Left Sidebar Container */}
          <aside className="w-[450px] border-r border-slate-200 bg-[#F4F7FB] flex flex-col shrink-0 overflow-hidden">
            {/* Reduced from p-5 to p-2 to gain 24px of vertical space */}
            <div className="flex-1 overflow-hidden p-2 flex flex-col">
              {children}
            </div>
          </aside>

          {/* Right Area: Flow Diagram Canvas */}
          <main className="flex-1 bg-[#FAFCFF] relative">
            <div className="absolute top-6 left-6 bg-white border border-slate-200 shadow-sm rounded-lg p-3 pr-6">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                Flow Diagram
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00C2FF]"></div>
                <span className="text-sm font-bold text-slate-800">
                  Simulation Flow
                </span>
              </div>
            </div>

            <div className="absolute top-6 right-6 flex items-center gap-2">
              <button className="w-9 h-9 bg-white border border-slate-200 shadow-sm rounded flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
              </button>
              <button className="w-9 h-9 bg-white border border-slate-200 shadow-sm rounded flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
              </button>
              <button className="w-9 h-9 bg-white border border-slate-200 shadow-sm rounded flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
              </button>
            </div>
          </main>

        </div>
      </body>
    </html>
  );
}