import './globals.css';
import Navbar from '@/components/Navbar'; // Double check this path!

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white antialiased h-screen flex flex-col overflow-hidden">
        {/* Your Navbar Component */}
        <Navbar />

        {/* The wrapper handles the remaining height */}
        <div className="flex flex-1 min-h-0">
          {/* Left Sidebar: Fixed Width, matching the dff.JPG design */}
          <aside className="w-[450px] border-r border-gray-200 bg-[#F8FAFC] flex flex-col shrink-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              {children}
            </div>
          </aside>

          {/* Right Area */}
          <main className="flex-1 bg-white relative">
            <div className="absolute top-4 left-4 border border-gray-200 px-3 py-1 rounded text-[10px] font-bold text-gray-400 uppercase">
              Flow Diagram
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}