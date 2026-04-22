import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Scale } from "lucide-react";
import Link from "next/link";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "TrialAI",
  description: "Put your AI on trial before the world does.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground flex flex-col min-h-screen`}
      >
        <nav className="sticky top-0 z-50 w-full border-b border-gray-800 bg-[#0a0a0f]/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-white">
              <Scale className="w-6 h-6 text-blue-500" />
              <span>TrialAI</span>
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/history" className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
                Audit History
              </Link>
              <Link href="/upload" className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-500 transition-all shadow-sm">
                New Audit
              </Link>
            </div>
          </div>
        </nav>
        <main className="flex-1 flex flex-col bg-[#0a0a0f]">
          {children}
        </main>
      </body>
    </html>
  );
}
