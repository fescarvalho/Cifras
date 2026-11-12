"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Setlist } from "@/generated/prisma/client";
import { getSetlists, deleteSetlist } from "@/app/actions";
import SetlistManager from "./SetlistManager";
import CreateSetlistModal from "./CreateSetlistModal";
import BottomNav from "./BottomNav";
import ActionSheet from "./ActionSheet";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db-local";
import { useOfflineSync } from "./OfflineSyncManager";

interface RepertoriosAppProps {
  initialSetlists: Setlist[];
}

export default function RepertoriosApp({ initialSetlists }: RepertoriosAppProps) {
  const router = useRouter();
  
  // Use Dexie as source of truth for setlists (offline support)
  const dexieSetlists = useLiveQuery(() => db.setlists.orderBy('date').reverse().toArray(), []);
  
  const setlists = useMemo(() => {
    if (dexieSetlists === undefined) return initialSetlists as any[];
    const map = new Map();
    (initialSetlists || []).forEach((s: any) => map.set(s.id, { ...s, isSynced: true }));
    (dexieSetlists || []).forEach((s: any) => map.set(s.id, s));
    return Array.from(map.values()).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [initialSetlists, dexieSetlists]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateSetlist, setShowCreateSetlist] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  
  const { isOnline } = useOfflineSync();

  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    } else {
      setDarkMode(false);
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    if (darkMode) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setDarkMode(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setDarkMode(true);
    }
  };

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirm = window.confirm("Deseja realmente excluir este repertório?");
    if (!confirm) return;

    if (expandedId === id) {
      setExpandedId(null);
    }

    // Optimistic local delete
    await db.setlists.delete(id);

    if (isOnline) {
      try {
        await deleteSetlist(id);
      } catch (err) {
        console.error(err);
      }
    } else {
      // Queue offline operation
      await db.syncQueue.add({
        action: 'DELETE_SETLIST',
        payload: { setlistId: id },
        createdAt: new Date()
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300 relative overflow-x-hidden">
      {/* Subtle ambient background glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[220px] bg-violet-500/10 dark:bg-violet-600/10 blur-[100px] rounded-full -z-0" />

      {/* Header */}
      <header className="backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/70 dark:border-slate-800/80 py-3 px-4 md:px-8 sticky top-0 z-20 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href="/"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 bg-slate-100/80 dark:bg-slate-800/80 active:bg-slate-200 dark:active:bg-slate-700 rounded-xl transition-all text-slate-700 dark:text-slate-300 active:scale-95 shrink-0"
              title="Voltar para Músicas"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="min-w-0">
              <h1 className="text-base md:text-xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-violet-700 dark:from-white dark:via-slate-100 dark:to-violet-400 bg-clip-text text-transparent truncate">
                Repertórios
              </h1>
              <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide truncate">
                Planejamento de Missas e Celebrações
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center p-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-all active:scale-95 shadow-sm"
              title={darkMode ? "Ativar Modo Claro" : "Ativar Modo Escuro"}
            >
              {darkMode ? (
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Quick Action Button (Hidden on mobile) */}
            <button
              onClick={() => setShowCreateSetlist(true)}
              className="hidden md:flex min-h-[40px] bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold py-2 px-4 rounded-xl text-xs md:text-sm items-center gap-1.5 transition-all shadow-md shadow-violet-500/20 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Novo Repertório</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main layout container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 pt-4 pb-28 md:p-8 flex flex-col gap-5 relative z-10">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-base md:text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
            Missas Planejadas
            <span className="text-xs font-mono font-bold bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/60 px-2.5 py-0.5 rounded-full">
              {setlists.length}
            </span>
          </h2>
        </div>

        {setlists.length === 0 ? (
          <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-10 text-center shadow-sm flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-950/50 text-violet-500 flex items-center justify-center mb-1">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-slate-700 dark:text-slate-200 font-bold text-sm">Nenhum repertório criado</p>
            <p className="text-xs text-slate-400 max-w-xs">Toque no botão "+" na barra inferior para planejar a sua próxima missa.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {setlists.map((s) => {
              const isExpanded = expandedId === s.id;
              const dateObj = new Date(s.date);
              const dayNum = dateObj.getDate().toString().padStart(2, "0");
              const monthShort = dateObj.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

              return (
                <div
                  key={s.id}
                  className={`bg-white dark:bg-slate-900/95 border rounded-2xl overflow-hidden transition-all duration-300 ${
                    isExpanded
                      ? "border-violet-400 dark:border-violet-600/80 shadow-lg shadow-violet-500/5"
                      : "border-slate-200/80 dark:border-slate-800/80 shadow-[0_2px_10px_rgba(0,0,0,0.02)]"
                  }`}
                >
                  {/* Collapsed Header click area */}
                  <div
                    onClick={() => handleToggle(s.id)}
                    className="p-4 flex items-center justify-between gap-3 cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/40 transition-all select-none"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Calendar Date Badge */}
                      <div
                        className={`flex flex-col items-center justify-center w-12 h-12 rounded-2xl shrink-0 border transition-colors ${
                          isExpanded
                            ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white border-transparent shadow-md shadow-violet-500/25"
                            : "bg-violet-50/80 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-800/50"
                        }`}
                        suppressHydrationWarning
                      >
                        <span className="text-[9px] uppercase font-extrabold tracking-wider opacity-80 leading-none">
                          {monthShort}
                        </span>
                        <span className="text-base font-extrabold font-mono leading-tight mt-0.5">
                          {dayNum}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 truncate">
                            {s.title}
                          </h3>
                          {!s.isSynced && (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">
                              Offline
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                            {s.songs?.length || 0} {s.songs?.length === 1 ? "música" : "músicas"}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 truncate" suppressHydrationWarning>
                            {dateObj.toLocaleDateString("pt-BR", { dateStyle: "medium" })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDelete(s.id, e)}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center p-2 text-slate-400 dark:text-slate-500 hover:text-rose-500 active:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-all active:scale-95"
                        title="Excluir repertório"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>

                      {/* Chevron indicator */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isExpanded ? "bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400" : "text-slate-400"}`}>
                        <svg
                          className={`w-4 h-4 transform transition-transform duration-300 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded block containing the SetlistManager */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800/80 transition-all duration-300">
                      <SetlistManager
                        setlistId={s.id}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Setlist Modal */}
      {showCreateSetlist && (
        <CreateSetlistModal
          onClose={() => setShowCreateSetlist(false)}
          onSuccess={() => setShowCreateSetlist(false)}
        />
      )}

      <BottomNav onAddClick={() => setShowActionSheet(true)} />
      <ActionSheet
        isOpen={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        onNewManual={() => setShowCreateSetlist(true)}
        onNewPrint={() => router.push("/repertorios/importar?type=print")}
        onNewPdf={() => router.push("/repertorios/importar?type=pdf")}
        mode="setlist"
      />
    </div>
  );
}
