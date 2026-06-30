"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Setlist } from "@/generated/prisma/client";
import { getSetlists, deleteSetlist } from "@/app/actions";
import SetlistManager from "./SetlistManager";
import CreateSetlistModal from "./CreateSetlistModal";
import BottomNav from "./BottomNav";
import ActionSheet from "./ActionSheet";
import { useRouter } from "next/navigation";

interface RepertoriosAppProps {
  initialSetlists: Setlist[];
}

export default function RepertoriosApp({ initialSetlists }: RepertoriosAppProps) {
  const router = useRouter();
  const [setlists, setSetlists] = useState<any[]>(initialSetlists);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateSetlist, setShowCreateSetlist] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

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

  const refreshData = async () => {
    const freshSetlists = await getSetlists();
    setSetlists(freshSetlists);
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

    // Optimistic delete
    setSetlists((prev) => prev.filter((s) => s.id !== id));

    try {
      await deleteSetlist(id);
      refreshData();
    } catch (err) {
      refreshData();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
      
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-4 px-4 md:px-8 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-600 dark:text-slate-400"
              title="Voltar para Músicas"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                Repertórios
              </h1>
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Planejamento de Missas e Celebrações
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850 transition-all active:scale-95 shadow-sm"
              title={darkMode ? "Ativar Modo Claro" : "Ativar Modo Escuro"}
            >
              {darkMode ? (
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* Quick Action Button (Hidden on mobile) */}
            <button
              onClick={() => setShowCreateSetlist(true)}
              className="hidden md:flex bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs md:text-sm items-center gap-1.5 transition-all shadow-md shadow-violet-500/10 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Novo Repertório</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main layout container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col gap-6 pb-24 md:pb-8">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
          Suas Missas Planejadas
          <span className="text-xs font-mono font-bold bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-500">
            {setlists.length}
          </span>
        </h2>

        {setlists.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 font-semibold mb-2">Nenhum repertório criado</p>
            <p className="text-xs text-slate-400 mb-4">Clique em "Novo Repertório" para planejar a sua próxima missa.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {setlists.map((s) => {
              const isExpanded = expandedId === s.id;
              
              return (
                <div
                  key={s.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-all duration-300"
                >
                  {/* Collapsed Header click area */}
                  <div
                    onClick={() => handleToggle(s.id)}
                    className="p-4 md:p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-850/50 transition-colors select-none"
                  >
                    <div className="min-w-0 pr-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-2">
                        {s.title}
                        {isExpanded && (
                          <span className="text-[10px] font-semibold bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 px-1.5 py-0.5 rounded">
                            Ativo
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {new Date(s.date).toLocaleDateString("pt-BR", { dateStyle: "long" })}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {/* Songs count badge */}
                      <span className="text-xs font-semibold font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-lg">
                        {s.songs?.length || 0} música(s)
                      </span>

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDelete(s.id, e)}
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-colors"
                        title="Excluir repertório"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>

                      {/* Chevron indicator */}
                      <span className="text-slate-400">
                        <svg
                          className={`w-5 h-5 transform transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  {/* Expanded block containing the SetlistManager */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800/80 transition-all duration-300">
                      <SetlistManager
                        setlistId={s.id}
                        onRefreshSetlists={refreshData}
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
          onSuccess={refreshData}
        />
      )}

      <BottomNav onAddClick={() => setShowActionSheet(true)} />
      <ActionSheet
        isOpen={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        onNewManual={() => setShowCreateSetlist(true)}
        onNewPdf={() => router.push("/repertorios/importar")}
      />
    </div>
  );
}
