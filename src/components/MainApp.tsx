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
import { useRouter } from "next/navigation";
import { PART_LABELS, PART_COLORS, SEASON_LABELS, SEASON_COLORS } from "@/utils/labels";
import { getSongs, getSetlists, deleteSetlist, deleteSong } from "@/app/actions";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db-local";
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
  
  // We'll use dexie data if available, otherwise initial data for SSR/first load
  const songs = dexieSongs || (initialSongs as any[]);
  const setlists = dexieSetlists || (initialSetlists as any[]);
  
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
      
      {/* Header bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-4 px-4 md:px-8 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-violet-600 p-2 rounded-xl text-white shadow-md shadow-violet-500/25">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                Cifras Litúrgicas
              </h1>
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Músicas e Repertórios para Missa
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Sync Status Indicator / Download Button */}
            {isDownloading ? (
              <div className="flex items-center text-xs px-3 py-1.5 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 min-h-[44px]">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span className="hidden sm:inline font-medium">Baixando...</span>
              </div>
            ) : lastSyncTime ? (
              <button 
                onClick={downloadOfflineData}
                disabled={!isOnline}
                className="flex items-center text-xs px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 min-h-[44px] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title={`Offline Atualizado: ${lastSyncTime.toLocaleDateString()} às ${lastSyncTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}\nClique para atualizar novamente.`}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline font-medium">Atualizado</span>
              </button>
            ) : (
              <button 
                onClick={downloadOfflineData}
                disabled={!isOnline}
                className="flex items-center text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 min-h-[44px] active:scale-95 transition-all shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isOnline ? "Baixar Acervo para Offline" : "Conecte-se para baixar"}
              >
                <CloudDownload className="w-4 h-4 mr-1.5 text-violet-500" />
                <span className="hidden sm:inline font-semibold">Baixar Offline</span>
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 active:bg-slate-50 dark:active:bg-slate-850 transition-all active:scale-95 shadow-sm"
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

            <Link
              href="/repertorios"
              className="hidden md:flex min-h-[44px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 active:bg-slate-50 dark:active:bg-slate-850 text-slate-700 dark:text-slate-350 font-semibold py-2.5 px-4 rounded-xl text-xs md:text-sm items-center gap-1.5 transition-all shadow-sm active:scale-95"
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
              className="hidden md:flex min-h-[44px] bg-violet-600 active:bg-violet-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs md:text-sm items-center gap-1.5 transition-all shadow-md shadow-violet-500/10 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Nova Cifra</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main layout container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 flex flex-col gap-6 pb-24 md:pb-8">
        
        {/* catalog */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              Catalogar Músicas
              <span className="text-xs font-mono font-bold bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-500">
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
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-sm">
              <p className="text-slate-500 dark:text-slate-400 font-semibold mb-2">Nenhuma música encontrada</p>
              {!lastSyncTime && !isOnline ? (
                <p className="text-xs text-slate-400">Você ainda não baixou nenhuma cifra para o modo offline. Conecte-se à internet e clique em "Baixar Offline".</p>
              ) : (
                <p className="text-xs text-slate-400">Tente ajustar seus filtros ou clique em "Nova Cifra" para cadastrar.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSongs.map((song) => (
                <div
                  key={song.id}
                  onClick={() => setSelectedSong(song)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 active:border-violet-500 dark:active:border-violet-500/80 active:bg-slate-50 dark:active:bg-slate-800/50 rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.98] flex flex-col gap-3 relative"
                >
                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDeleteSong(song.id, song.title, e)}
                    className="absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 active:text-rose-500 active:bg-rose-50 dark:active:bg-rose-950/50 transition-all active:scale-95"
                    title="Excluir música"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  <div className="flex justify-between items-start gap-2 pr-6">
                    <div>
                      <h3 className="font-bold text-slate-950 dark:text-slate-50 active:text-violet-600 transition-colors line-clamp-1">
                        {song.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{song.artist}</p>
                    </div>
                    <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-violet-600 dark:text-violet-400 shrink-0">
                      {song.originalKey}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PART_COLORS[song.part as keyof typeof PART_COLORS]}`}>
                      {PART_LABELS[song.part as keyof typeof PART_LABELS]}
                    </span>
                    {song.season && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${SEASON_COLORS[song.season as keyof typeof SEASON_COLORS]}`}>
                        {SEASON_LABELS[song.season as keyof typeof SEASON_LABELS]}
                      </span>
                    )}
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
        onNewPdf={() => router.push("/repertorios/importar")}
      />
    </div>
  );
}
