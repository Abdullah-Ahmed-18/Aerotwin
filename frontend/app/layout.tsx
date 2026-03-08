import './globals.css';
import Navbar from '@/components/Navbar';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* flex-col ensures the Navbar is fixed at the top, and children take the rest of the height */}
      <body className="bg-white antialiased h-screen flex flex-col overflow-hidden">

        <Navbar />

        {/* This wrapper handles the specific page content (Config or Flights) */}
        <div className="flex flex-1 min-h-0 w-full">
          {children}
        </div>

      </body>
    </html>
  );
}