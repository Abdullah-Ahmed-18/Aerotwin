import type { ReactNode } from "react";
import "../globals.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 antialiased h-screen flex items-center justify-center overflow-hidden font-sans">
        {/* Animated background overlay */}
        <div className="fixed inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
          <div
            className="absolute bottom-20 right-10 w-72 h-72 bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"
            style={{ animationDelay: "2s" }}
          ></div>
        </div>

        {/* Auth Container - Centered */}
        <div className="relative z-10 w-full max-w-md px-4 sm:px-0 flex items-center justify-center">
          {children}
        </div>
      </body>
    </html>
  );
}
