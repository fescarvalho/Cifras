import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music, BookOpen, PlusCircle } from "lucide-react";

interface BottomNavProps {
  onAddClick: () => void;
}

export default function BottomNav({ onAddClick }: BottomNavProps) {
  const pathname = usePathname();

  const isHome = pathname === "/";
  const isRepertorios = pathname?.startsWith("/repertorios");

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_10px_rgba(0,0,0,0.4)] pb-safe">
      <div className="flex items-center justify-around h-16">
        
        {/* Músicas */}
        <Link 
          href="/" 
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all active:scale-95 ${
            isHome ? "text-violet-600 dark:text-violet-400" : "text-slate-500 dark:text-slate-400 active:text-slate-900 dark:active:text-slate-200"
          }`}
        >
          <Music size={22} strokeWidth={isHome ? 2.5 : 2} />
          <span className="text-[10px] font-semibold">Músicas</span>
        </Link>

        {/* Adicionar (Centralizado e Maior) */}
        <button
          onClick={onAddClick}
          className="flex flex-col items-center justify-center w-full h-full transition-transform active:scale-95"
        >
          <div className="bg-violet-600 active:bg-violet-700 text-white rounded-full p-2.5 shadow-lg shadow-violet-500/30 transform -translate-y-2 transition-colors">
            <PlusCircle size={26} strokeWidth={2.5} />
          </div>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 -mt-1">Adicionar</span>
        </button>

        {/* Repertórios */}
        <Link 
          href="/repertorios" 
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-all active:scale-95 ${
            isRepertorios ? "text-violet-600 dark:text-violet-400" : "text-slate-500 dark:text-slate-400 active:text-slate-900 dark:active:text-slate-200"
          }`}
        >
          <BookOpen size={22} strokeWidth={isRepertorios ? 2.5 : 2} />
          <span className="text-[10px] font-semibold">Missas</span>
        </Link>
        
      </div>
    </nav>
  );
}
