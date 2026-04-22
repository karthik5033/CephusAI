"use client";

import Link from "next/link";
import { Scale } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const isCinematic = pathname === "/" || pathname.startsWith("/trial/");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`${isCinematic ? "fixed" : "sticky"} top-0 z-50 w-full transition-all duration-300 ${
      isCinematic 
        ? scrolled 
          ? "bg-black/80 backdrop-blur-xl border-b border-white/10 py-3" 
          : "bg-transparent border-b border-transparent py-5"
        : "bg-background/80 backdrop-blur-xl border-b border-border py-4"
    }`}>
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Link href="/" className={`flex items-center gap-2 font-bold text-xl tracking-tight ${isCinematic ? "text-white" : "text-foreground"}`}>
          <Scale className="w-6 h-6 text-gold" />
          <span>TrialAI</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/demo" className={`text-sm font-medium transition-colors ${isCinematic ? "text-white/80 hover:text-white" : "text-foreground/70 hover:text-foreground"}`}>
            Run Demo
          </Link>
          <Link href="/history" className={`text-sm font-medium transition-colors ${isCinematic ? "text-white/80 hover:text-white" : "text-foreground/70 hover:text-foreground"}`}>
            Audit History
          </Link>
          <Link href="/trial/upload" className={`text-sm font-medium px-5 py-2.5 rounded-lg transition-all shadow-lg hover:-translate-y-0.5 ${
            isCinematic 
              ? "bg-white text-black hover:bg-gray-200" 
              : "bg-foreground text-background hover:bg-foreground/90"
          }`}>
            Start Trial
          </Link>
        </div>
      </div>
    </nav>
  );
}
