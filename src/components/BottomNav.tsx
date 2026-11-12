import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music, BookOpen, Plus } from "lucide-react";

interface BottomNavProps {
  onAddClick: () => void;
}

export default function BottomNav({ onAddClick }: BottomNavProps) {
  const pathname = usePathname();

  const isHome = pathname === "/";
  const isRepertorios = pathname?.startsWith("/repertorios");

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pb-3 pt-1 pointer-events-none pb-safe">
      <nav className="pointer-events-auto max-w-md mx-auto bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/90 rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.55)] px-2">
        <div className="flex items-center justify-around h-16">
          {/* Músicas */}
          <Link
            href="/"
            className={`relative flex flex-col items-center justify-center w-full h-full gap-1 transition-all active:scale-95 ${
              isHome
                ? "text-violet-600 dark:text-violet-400"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <div
              className={`px-4 py-1 rounded-full transition-colors ${
                isHome ? "bg-violet-100/80 dark:bg-violet-950/70" : ""
              }`}
            >
              <Music size={20} strokeWidth={isHome ? 2.5 : 2} />
            </div>
            <span className="text-[11px] font-semibold tracking-tight">Músicas</span>
          </Link>

          {/* Botão Central Floating (Adicionar) */}
          <div className="flex items-center justify-center w-full h-full">
            <button
              onClick={onAddClick}
              aria-label="Adicionar"
              className="group relative flex flex-col items-center justify-center -translate-y-3 transition-transform active:scale-90"
            >
              <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-violet-600 via-violet-500 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-violet-600/35 dark:shadow-violet-600/25 ring-4 ring-white dark:ring-slate-900">
                <Plus size={26} strokeWidth={2.75} />
              </div>
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mt-1">
                Novo
              </span>
            </button>
          </div>

          {/* Repertórios */}
          <Link
            href="/repertorios"
            className={`relative flex flex-col items-center justify-center w-full h-full gap-1 transition-all active:scale-95 ${
              isRepertorios
                ? "text-violet-600 dark:text-violet-400"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <div
              className={`px-4 py-1 rounded-full transition-colors ${
                isRepertorios ? "bg-violet-100/80 dark:bg-violet-950/70" : ""
              }`}
            >
              <BookOpen size={20} strokeWidth={isRepertorios ? 2.5 : 2} />
            </div>
            <span className="text-[11px] font-semibold tracking-tight">Missas</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
