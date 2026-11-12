"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Song, Setlist } from "@/generated/prisma/client";
import SongFilters from "./SongFilters";
import SongViewer from "./SongViewer";
import SetlistManager from "./SetlistManager";
import CreateSongModal from "./CreateSongModal";
import CreateSetlistModal from "./CreateSetlistModal";
import BottomNav from "./BottomNav";
import ActionSheet from "./ActionSheet";
import GuitarTuner from "./GuitarTuner";
import { useRouter } from "next/navigation";
import { PART_LABELS, PART_COLORS, SEASON_LABELS, SEASON_COLORS } from "@/utils/labels";
import { getSongs, getSetlists, deleteSetlist, deleteSong } from "@/app/actions";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db-local";
import { clearLocalOfflineData } from "@/lib/db-local";
import { useOfflineSync } from "./OfflineSyncManager";
import { CloudDownload, Loader2, CheckCircle2 } from "lucide-react";

interface MainAppProps {
  initialSongs: Song[];
  initialSetlists: Setlist[];
}

export default function MainApp({ initialSongs, initialSetlists }: MainAppProps) {
  const router = useRouter();
  
  // Use Dexie as the single source of truth for songs and setlists
  const dexieSongs = useLiveQuery(() => db.songs.orderBy('title').toArray(), []);
  const dexieSetlists = useLiveQuery(() => db.setlists.orderBy('date').reverse().toArray(), []);
  
  const songs = useMemo(() => {
    if (dexieSongs === undefined) return initialSongs as any[];
    const map = new Map();
    (initialSongs || []).forEach((s: any) => map.set(s.id, { ...s, isSynced: true }));
    (dexieSongs || []).forEach((s: any) => map.set(s.id, s));
    return Array.from(map.values()).sort((a: any, b: any) => a.title.localeCompare(b.title));
  }, [initialSongs, dexieSongs]);

  const setlists = useMemo(() => {
    if (dexieSetlists === undefined) return initialSetlists as any[];
    const map = new Map();
    (initialSetlists || []).forEach((s: any) => map.set(s.id, { ...s, isSynced: true }));
    (dexieSetlists || []).forEach((s: any) => map.set(s.id, s));
    return Array.from(map.values()).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [initialSetlists, dexieSetlists]);
  
  const { isOnline, isDownloading, lastSyncTime, downloadOfflineData } = useOfflineSync();

  // Filter States
  const [search, setSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState<any>("ALL");
  const [selectedSeason, setSelectedSeason] = useState<any>("ALL");

  // Selected entities for detail views
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string>("");

  // Modals state
  const [showCreateSong, setShowCreateSong] = useState(false);
  const [showCreateSetlist, setShowCreateSetlist] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showTuner, setShowTuner] = useState(false);

  // Theme state
  const [darkMode, setDarkMode] = useState(false);

  // Initialize theme & register service worker
  useEffect(() => {
    // Check local storage or prefers-color-scheme
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

  // Re-fetch data from DB on changes
  const refreshData = async () => {
    if (!navigator.onLine) return; 
    // Mostly handled by dexie now, but can be used as hook
  };

  const handleLogout = async () => {
    const confirm = window.confirm("Deseja realmente sair? Seus dados offline sincronizados serão apagados deste dispositivo.");
    if (!confirm) return;
    
    await clearLocalOfflineData();
    window.location.reload();
  };

  // Client-side instant filter of songs
  const filteredSongs = useMemo(() => {
    return songs.filter((song) => {
      const matchesSearch =
        song.title.toLowerCase().includes(search.toLowerCase()) ||
        song.artist.toLowerCase().includes(search.toLowerCase());

      const matchesPart = selectedPart === "ALL" || song.part === selectedPart;
      const matchesSeason = selectedSeason === "ALL" || song.season === selectedSeason;

      return matchesSearch && matchesPart && matchesSeason;
    });
  }, [songs, search, selectedPart, selectedSeason]);

  const handleDeleteSetlist = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirm = window.confirm("Deseja realmente excluir este repertório?");
    if (!confirm) return;

    if (selectedSetlistId === id) {
      setSelectedSetlistId("");
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

  const handleDeleteSong = async (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Excluir "${title}" permanentemente? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    if (!isOnline) {
      alert("Sem conexão para excluir a música do servidor.");
      return;
    }

    // Close viewer if this song is open
    if (selectedSong?.id === id) setSelectedSong(null);

    // Optimistic delete local
    await db.songs.delete(id);

    try {
      await deleteSong(id);
    } catch (err) {
      console.error(err);
      // Let sync resolve the state later
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300 relative overflow-x-hidden">
      {/* Subtle ambient background glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[220px] bg-violet-500/10 dark:bg-violet-600/10 blur-[100px] rounded-full -z-0" />

      {/* Header bar */}
      <header className="backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/70 dark:border-slate-800/80 py-3 px-4 md:px-8 sticky top-0 z-20 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-gradient-to-br from-violet-600 to-indigo-600 p-2.5 rounded-2xl text-white shadow-lg shadow-violet-500/25 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-base md:text-xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-violet-700 dark:from-white dark:via-slate-100 dark:to-violet-400 bg-clip-text text-transparent truncate">
                Cifras Litúrgicas
              </h1>
              <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide truncate">
                Músicas e Repertórios para Missa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Sync Status Indicator / Download Button */}
            {isDownloading ? (
              <div className="flex items-center text-xs px-3 py-2 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 min-h-[40px]">
                <Loader2 className="w-4 h-4 sm:mr-1.5 animate-spin" />
                <span className="hidden sm:inline font-semibold">Baixando...</span>
              </div>
            ) : lastSyncTime ? (
              <button 
                onClick={downloadOfflineData}
                disabled={!isOnline}
                className="flex items-center justify-center text-xs px-2.5 sm:px-3 py-2 rounded-xl border border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 min-h-[40px] min-w-[40px] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title={`Offline Atualizado: ${lastSyncTime.toLocaleDateString()} às ${lastSyncTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}\nClique para atualizar novamente.`}
              >
                <CheckCircle2 className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline font-semibold">Offline OK</span>
              </button>
            ) : (
              <button 
                onClick={downloadOfflineData}
                disabled={!isOnline}
                className="flex items-center justify-center text-xs px-2.5 sm:px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 min-h-[40px] min-w-[40px] active:scale-95 transition-all shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isOnline ? "Baixar Acervo para Offline" : "Conecte-se para baixar"}
              >
                <CloudDownload className="w-4 h-4 sm:mr-1.5 text-violet-500" />
                <span className="hidden sm:inline font-semibold">Baixar Offline</span>
              </button>
            )}
            {/* Guitar Tuner Button */}
            <button
              onClick={() => setShowTuner(true)}
              className="flex items-center justify-center gap-1.5 text-xs px-2.5 sm:px-3 py-2 rounded-xl border border-violet-200/80 dark:border-violet-800/60 bg-violet-50/80 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 min-h-[40px] min-w-[40px] active:scale-95 transition-all shadow-sm"
              title="Abrir Afinador de Violão"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span className="hidden sm:inline font-bold">Afinador</span>
            </button>

            <button
              onClick={toggleTheme}
              className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700 transition-all active:scale-95 shadow-sm"
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

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-rose-200/80 dark:border-rose-900/40 bg-rose-50/80 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 active:bg-rose-100 dark:active:bg-rose-900/40 transition-all active:scale-95 shadow-sm"
              title="Sair (Logout)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>

            <Link
              href="/repertorios"
              className="hidden md:flex min-h-[40px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 active:bg-slate-50 dark:active:bg-slate-850 text-slate-700 dark:text-slate-300 font-semibold py-2 px-4 rounded-xl text-xs md:text-sm items-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span>Repertórios</span>
            </Link>

            {/* Quick Action Button (Hidden on mobile) */}
            <button
              onClick={() => {
                if (!isOnline) {
                  alert("Sem conexão para criar nova cifra.");
                  return;
                }
                setShowActionSheet(true);
              }}
              className="hidden md:flex min-h-[40px] bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold py-2 px-4 rounded-xl text-xs md:text-sm items-center gap-1.5 transition-all shadow-md shadow-violet-500/20 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Nova Cifra</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main layout container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 pt-4 pb-28 md:p-8 flex flex-col gap-5 relative z-10">
        
        {/* catalog */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-base md:text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50 flex items-center gap-2">
              Acervo de Cifras
              <span className="text-xs font-mono font-bold bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/60 px-2.5 py-0.5 rounded-full">
                {filteredSongs.length}
              </span>
            </h2>
          </div>

          {/* Filters */}
          <SongFilters
            search={search}
            setSearch={setSearch}
            selectedPart={selectedPart}
            setSelectedPart={setSelectedPart}
            selectedSeason={selectedSeason}
            setSelectedSeason={setSelectedSeason}
          />

          {/* Chords Sheet List */}
          {filteredSongs.length === 0 ? (
            <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-10 text-center shadow-sm flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-violet-50 dark:bg-violet-950/50 text-violet-500 flex items-center justify-center mb-1">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <p className="text-slate-700 dark:text-slate-200 font-bold text-sm">Nenhuma música encontrada</p>
              {!lastSyncTime && !isOnline ? (
                <p className="text-xs text-slate-400 max-w-xs">Você ainda não baixou nenhuma cifra para o modo offline. Conecte-se à internet e toque em "Baixar Offline".</p>
              ) : (
                <p className="text-xs text-slate-400 max-w-xs">Tente ajustar os filtros acima ou toque no botão "+" para adicionar uma nova cifra.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredSongs.map((song) => (
                <div
                  key={song.id}
                  onClick={() => setSelectedSong(song)}
                  className="group bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800/80 hover:border-violet-300 dark:hover:border-violet-700/70 active:border-violet-500 rounded-2xl p-4 cursor-pointer transition-all duration-200 active:scale-[0.98] shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md flex items-center justify-between gap-3 relative overflow-hidden"
                >
                  {/* Subtle left accent bar */}
                  <div className="w-1 self-stretch rounded-full bg-gradient-to-b from-violet-500 to-indigo-500 opacity-80 shrink-0" />

                  {/* Song Info */}
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-[15px] text-slate-900 dark:text-slate-50 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors truncate">
                        {song.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {song.artist}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${PART_COLORS[song.part as keyof typeof PART_COLORS]}`}>
                        {PART_LABELS[song.part as keyof typeof PART_LABELS]}
                      </span>
                      {song.season && (
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${SEASON_COLORS[song.season as keyof typeof SEASON_COLORS]}`}>
                          {SEASON_LABELS[song.season as keyof typeof SEASON_LABELS]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right side: Key Badge + Delete Action */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex flex-col items-center justify-center min-w-[42px] h-[42px] rounded-xl bg-violet-50 dark:bg-violet-950/50 border border-violet-200/60 dark:border-violet-800/50 px-2">
                      <span className="text-[9px] uppercase tracking-wider font-bold text-violet-400 dark:text-violet-500 leading-none">
                        Tom
                      </span>
                      <span className="font-mono text-xs font-extrabold text-violet-700 dark:text-violet-300 leading-tight mt-0.5">
                        {song.originalKey}
                      </span>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSong(song.id, song.title, e)}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:text-rose-500 active:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:bg-rose-100 transition-all active:scale-95"
                      title="Excluir música"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Song Viewer Fullscreen Overlay Modal */}
      {selectedSong && (
        <div className="fixed inset-0 z-40 bg-slate-50 dark:bg-slate-950">
          <SongViewer
            song={selectedSong}
            setlists={setlists}
            onClose={() => {
              setSelectedSong(null);
              refreshData(); // To update setlist count/visuals if added
            }}
            showBackButton={true}
          />
        </div>
      )}

      {/* Create Song Modal */}
      {showCreateSong && (
        <CreateSongModal
          onClose={() => setShowCreateSong(false)}
          onSuccess={() => {
            refreshData();
            // Show custom alert or notification? Modal takes care of closing
          }}
        />
      )}

      {/* Create Setlist Modal */}
      {showCreateSetlist && (
        <CreateSetlistModal
          onClose={() => setShowCreateSetlist(false)}
          onSuccess={() => {
            refreshData();
          }}
        />
      )}

      {/* Guitar Tuner Modal */}
      {showTuner && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowTuner(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <GuitarTuner onClose={() => setShowTuner(false)} />
          </div>
        </div>
      )}

      <BottomNav onAddClick={() => {
        if (!isOnline) {
          alert("Sem conexão para criar nova cifra.");
          return;
        }
        setShowActionSheet(true);
      }} />
      <ActionSheet
        isOpen={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        onNewManual={() => setShowCreateSong(true)}
        onNewPrint={() => router.push("/repertorios/importar?type=print")}
        onNewPdf={() => router.push("/repertorios/importar?type=pdf")}
      />
    </div>
  );
}
