import './globals.css';
import Navbar from '@/components/Navbar';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white antialiased h-screen flex flex-col overflow-hidden">
        <Navbar />
        {children}
      </body>
    </html>
  );
}