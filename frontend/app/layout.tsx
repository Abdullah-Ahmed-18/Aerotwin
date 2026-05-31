'use client';

import { usePathname } from 'next/navigation';
import './globals.css';
import Navbar from '@/components/Navbar';
import { SimulationProvider } from '@/lib/SimulationContext';
import { AppStateProvider } from '@/lib/AppStateContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith('/auth');

  return (
    <html lang="en">
      <body className="bg-white antialiased h-screen flex flex-col overflow-hidden">
        <body className="bg-white antialiased h-screen flex flex-col overflow-hidden">
          <AppStateProvider>
            <SimulationProvider>
              {!isAuthPage && <Navbar />}

              {/* This wrapper handles the specific page content (Config or Flights) */}
              <div className="flex flex-1 min-h-0 w-full">
                {children}
              </div>
            </SimulationProvider>
          </AppStateProvider>
        </body>
      </body>
    </html>
  );
}