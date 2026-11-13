"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { Setlist, Song } from "@/generated/prisma/client";
import { getSetlistWithSongs, removeSongFromSetlist, updateSetlistOrder, createSong, addSongToSetlist, updateSetlistSongKey } from "@/app/actions";
import { PART_LABELS, PART_COLORS } from "@/utils/labels";
import { getTransposedKey, getPreferredScale } from "@/utils/chordTransposer";
import SongViewer from "./SongViewer";
import { db } from "@/lib/db-local";
import { useOfflineSync } from "./OfflineSyncManager";
import { Share2, Check, CloudDownload, Loader2 } from "lucide-react";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { getSupabaseClient } from "@/lib/supabase";

interface SetlistManagerProps {
  setlistId: string;
  onClose?: () => void;
  onRefreshSetlists?: () => void;
  readOnly?: boolean;
}

interface SetlistSongWithModel {
  id: string;
  setlistId: string;
  songId: string;
  order: number;
  selectedKey?: string | null;
  song: any;
}

export default function SetlistManager({ setlistId, onClose, onRefreshSetlists, readOnly = false }: SetlistManagerProps) {
  useScreenWakeLock();
  const [setlist, setSetlist] = useState<any>(null);
  const [songs, setSongs] = useState<SetlistSongWithModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const [activePerformanceSongIdx, setActivePerformanceSongIdx] = useState(0);
  const [perfFontSize, setPerfFontSize] = useState(14);
  const [selectedSetlistSong, setSelectedSetlistSong] = useState<SetlistSongWithModel | null>(null);
  const [shareFeedback, setShareFeedback] = useState(false);
  
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPart, setQuickPart] = useState("ENTRADA");
  const [isQuickAdding, setIsQuickAdding] = useState(false);

  const [isDownloadingSetlist, setIsDownloadingSetlist] = useState(false);
  const [downloadedAt, setDownloadedAt] = useState<Date | null>(null);

  const { isOnline } = useOfflineSync();
  const realtimeChannelRef = useRef<any>(null);

  const loadSetlistDetails = async () => {
    setLoading(true);
    setError("");
    try {
      // First try to load from local db
      const localSetlist = await db.setlists.get(setlistId);
      
      if (localSetlist) {
        setSetlist(localSetlist);
        setSongs([...localSetlist.songs].sort((a, b) => a.order - b.order));
      } else if (isOnline) {
        const data = await getSetlistWithSongs(setlistId);
        if (data) {
          setSetlist(data);
          setSongs(data.songs as any[]);
        } else {
          setError("Repertório não encontrado.");
        }
      } else {
        setError("Repertório não encontrado localmente.");
      }
    } catch (e: any) {
      setError(`Erro ao carregar detalhes: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSetlistDetails();
  }, [setlistId]);

  // 2. Modo "Maestro" (Supabase Realtime) — subscrição silenciosa para sincronização de tom
  useEffect(() => {
    if (!setlistId || !isOnline) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let channel: any = null;
    try {
      channel = supabase.channel(`setlist-${setlistId}`, {
        config: {
          broadcast: { self: false },
        },
      });

      channel
        .on("broadcast", { event: "key-change" }, ({ payload }: any) => {
          if (!payload || !payload.songId || !payload.targetKey) return;
          const { songId, targetKey } = payload;

          // Atualiza o estado local imediatamente para todos os músicos conectados
          setSongs((prev) =>
            prev.map((s) => (s.songId === songId ? { ...s, selectedKey: targetKey } : s))
          );

          setSelectedSetlistSong((prev) =>
            prev && prev.songId === songId ? { ...prev, selectedKey: targetKey } : prev
          );

          // Persiste silenciosamente no banco offline local (Dexie)
          db.setlists
            .get(setlistId)
            .then((localSetlist) => {
              if (localSetlist) {
                localSetlist.songs = localSetlist.songs.map((s: any) =>
                  s.songId === songId ? { ...s, selectedKey: targetKey } : s
                );
                return db.setlists.put(localSetlist);
              }
            })
            .catch(() => {});
        })
        .subscribe(() => {
          // Tratamento silencioso caso o tablet esteja offline ou sem rede estável
        });

      realtimeChannelRef.current = channel;
    } catch {
      // Silencioso em modo offline
    }

    return () => {
      try {
        if (channel) {
          supabase.removeChannel(channel).catch(() => {});
        }
        realtimeChannelRef.current = null;
      } catch {
        // Silencioso no cleanup offline
      }
    };
  }, [setlistId, isOnline]);

  const handleKeyChange = async (songId: string, newKey: string | null) => {
    // 1. Optimistic UI update
    setSongs(prev => prev.map(s => s.songId === songId ? { ...s, selectedKey: newKey } : s));

    if (selectedSetlistSong && selectedSetlistSong.songId === songId) {
      setSelectedSetlistSong(prev => prev ? { ...prev, selectedKey: newKey } : prev);
    }

    // 2. Broadcast em tempo real (Modo "Maestro" - Supabase Realtime)
    if (newKey && isOnline && realtimeChannelRef.current) {
      try {
        realtimeChannelRef.current
          .send({
            type: "broadcast",
            event: "key-change",
            payload: { songId, targetKey: newKey },
          })
          .catch(() => {});
      } catch {
        // Ignora silenciosamente caso o dispositivo esteja offline
      }
    }

    // 3. Local DB update
    if (setlist) {
      const localSetlist = await db.setlists.get(setlistId);
      if (localSetlist) {
        localSetlist.songs = localSetlist.songs.map((s: any) => 
          s.songId === songId ? { ...s, selectedKey: newKey } : s
        );
        await db.setlists.put(localSetlist);
      }
    }

    // 4. Online/Offline Sync
    if (isOnline && !setlistId.startsWith('temp_')) {
      try {
        const res = await updateSetlistSongKey(setlistId, songId, newKey);
        if (!res.success) {
           console.error("Failed to update key online");
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      await db.syncQueue.add({
        action: 'UPDATE_SETLIST_SONG_KEY',
        payload: { setlistId, songId, selectedKey: newKey },
        createdAt: new Date()
      });
    }
  };

  const handleNextPerformanceSong = useCallback(() => {
    setActivePerformanceSongIdx((prev) => Math.min(songs.length - 1, prev + 1));
  }, [songs.length]);

  const handlePrevPerformanceSong = useCallback(() => {
    setActivePerformanceSongIdx((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNextModalSong = useCallback(() => {
    if (!selectedSetlistSong || songs.length === 0) return;
    const currentIndex = songs.findIndex((s) => s.songId === selectedSetlistSong.songId);
    if (currentIndex >= 0 && currentIndex < songs.length - 1) {
      setSelectedSetlistSong(songs[currentIndex + 1]);
    }
  }, [selectedSetlistSong, songs]);

  const handlePrevModalSong = useCallback(() => {
    if (!selectedSetlistSong || songs.length === 0) return;
    const currentIndex = songs.findIndex((s) => s.songId === selectedSetlistSong.songId);
    if (currentIndex > 0) {
      setSelectedSetlistSong(songs[currentIndex - 1]);
    }
  }, [selectedSetlistSong, songs]);

  const handlePerfTranspose = (direction: number) => {
    if (songs.length === 0) return;
    const currentSetlistSong = songs[activePerformanceSongIdx];
    const baseKey = currentSetlistSong.selectedKey || currentSetlistSong.song.originalKey;
    const preferredScale = getPreferredScale(currentSetlistSong.song.content);
    const newKey = getTransposedKey(baseKey, direction, preferredScale);
    handleKeyChange(currentSetlistSong.songId, newKey);
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= songs.length) return;

    // Swap songs in local state
    const newSongs = [...songs];
    const temp = newSongs[index];
    newSongs[index] = newSongs[targetIdx];
    newSongs[targetIdx] = temp;
    
    // Update orders in array
    newSongs.forEach((s, idx) => {
      s.order = idx + 1;
    });

    // Optimistic state update
    setSongs(newSongs);

    // Save to Local DB
    if (setlist) {
      await db.setlists.update(setlistId, { songs: newSongs });
    }

    const songIdsInOrder = newSongs.map(s => s.songId);
    
    if (isOnline && !setlistId.startsWith('temp_')) {
      try {
        const res = await updateSetlistOrder(setlistId, songIdsInOrder);
        if (!res.success) {
          loadSetlistDetails();
        } else if (onRefreshSetlists) {
          onRefreshSetlists();
        }
      } catch (e) {
        loadSetlistDetails();
      }
    } else {
      // Queue offline
      await db.syncQueue.add({
        action: 'UPDATE_SETLIST_ORDER',
        payload: { setlistId, songIdsInOrder },
        createdAt: new Date()
      });
      if (onRefreshSetlists) onRefreshSetlists();
    }
  };

  const handleRemove = async (songId: string) => {
    const confirm = window.confirm("Deseja realmente remover esta música do repertório?");
    if (!confirm) return;

    // Optimistic delete
    const newSongs = songs.filter(s => s.songId !== songId);
    setSongs(newSongs);

    if (setlist) {
      await db.setlists.update(setlistId, { songs: newSongs });
    }

    if (isOnline && !setlistId.startsWith('temp_')) {
      try {
        const res = await removeSongFromSetlist(setlistId, songId);
        if (!res.success) {
          loadSetlistDetails();
        } else {
          if (onRefreshSetlists) onRefreshSetlists();
          loadSetlistDetails();
        }
      } catch (e) {
        loadSetlistDetails();
      }
    } else {
      await db.syncQueue.add({
        action: 'REMOVE_SONG_FROM_SETLIST',
        payload: { setlistId, songId },
        createdAt: new Date()
      });
      if (onRefreshSetlists) onRefreshSetlists();
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/repertorios/${setlistId}`;
    const shareTitle = `Repertório: ${setlist.title}`;
    const shareText = `Confira as cifras e tons para a missa: ${setlist.title}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } catch (error) {
        console.log('Compartilhamento cancelado ou falhou:', error);
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setShareFeedback(true);
      setTimeout(() => setShareFeedback(false), 2000);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    setIsQuickAdding(true);

    try {
      if (isOnline && !setlistId.startsWith('temp_')) {
        const songRes = await createSong({
          title: quickTitle,
          artist: "Desconhecido",
          originalKey: "C",
          content: "Cifra não adicionada.",
          part: quickPart as any,
          season: null
        });

        if (songRes.success && songRes.song) {
          await addSongToSetlist(setlistId, songRes.song.id);
          
          // Update local Dexie DB to ensure instant UI update
          const localSetlist = await db.setlists.get(setlistId);
          if (localSetlist) {
            const newOrder = localSetlist.songs.length > 0 ? Math.max(...localSetlist.songs.map((s: any) => s.order)) + 1 : 1;
            localSetlist.songs.push({
              id: `rel_${Date.now()}`,
              setlistId: setlistId,
              songId: songRes.song.id,
              order: newOrder,
              song: songRes.song as any
            });
            await db.setlists.put(localSetlist);
          }

          setQuickTitle("");
          loadSetlistDetails();
          if (onRefreshSetlists) onRefreshSetlists();
        }
      } else {
        const tempSongId = `temp_song_val_${Date.now()}`;
        const newSong = {
          id: tempSongId,
          title: quickTitle,
          artist: "Desconhecido",
          originalKey: "C",
          content: "Cifra não adicionada.",
          part: quickPart,
          season: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await db.songs.add(newSong as any);
        
        await db.syncQueue.add({
          action: 'CREATE_SONG',
          payload: newSong,
          createdAt: new Date()
        });

        const localSetlist = await db.setlists.get(setlistId);
        if (localSetlist) {
          const newOrder = localSetlist.songs.length > 0 ? Math.max(...localSetlist.songs.map((s: any) => s.order)) + 1 : 1;
          localSetlist.songs.push({
            id: `temp_rel_${Date.now()}`,
            setlistId: setlistId,
            songId: tempSongId,
            order: newOrder,
            song: newSong as any
          });
          await db.setlists.put(localSetlist);
          
          await db.syncQueue.add({
            action: 'ADD_SONG_TO_SETLIST',
            payload: { setlistId, songId: tempSongId },
            createdAt: new Date()
          });
        }
        setQuickTitle("");
        loadSetlistDetails();
        if (onRefreshSetlists) onRefreshSetlists();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsQuickAdding(false);
    }
  };

  const handleDownloadSetlist = async () => {
    if (!isOnline) return;
    setIsDownloadingSetlist(true);
    try {
      const data = await getSetlistWithSongs(setlistId);
      if (data) {
        // save setlist locally
        await db.setlists.put({ ...data, isSynced: true } as any);
        // save songs locally
        const songsToPut = data.songs.map((s: any) => ({ ...s.song, isSynced: true }));
        await db.songs.bulkPut(songsToPut as any);
        setDownloadedAt(new Date());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDownloadingSetlist(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <svg className="animate-spin w-8 h-8 text-violet-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8.89M9 11l3 3L22 4" />
        </svg>
        <span>Carregando repertório...</span>
      </div>
    );
  }

  if (error || !setlist) {
    return (
      <div className="p-8 text-center text-rose-500">
        <p className="font-semibold">{error || "Repertório não encontrado"}</p>
        <button onClick={onClose} className="mt-4 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 py-2 px-4 rounded-lg">
          Voltar
        </button>
      </div>
    );
  }

  if (isPerformanceMode && songs.length > 0) {
    // Show one song at a time with buttons to navigate
    const currentSetlistSong = songs[activePerformanceSongIdx];
    const currentSong = currentSetlistSong.song;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100">
        {/* Performance Top Bar — sleek glassmorphic pill bar */}
        <div className="backdrop-blur-xl bg-slate-900/90 border-b border-slate-800/80 px-2.5 py-2 flex items-center gap-2">
          <button
            onClick={() => setIsPerformanceMode(false)}
            className="bg-slate-800/90 active:bg-slate-700 p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-300 shrink-0 active:scale-95 transition-all border border-slate-700/60"
            title="Sair do Modo de Execução"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Quick select buttons — horizontal swipeable pills */}
          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0">
            {songs.map((s, idx) => {
              const active = idx === activePerformanceSongIdx;
              return (
                <button
                  key={s.id}
                  onClick={() => setActivePerformanceSongIdx(idx)}
                  className={`text-xs font-bold px-3 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 min-h-[40px] ${
                    active
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/30"
                      : "bg-slate-800/70 text-slate-400 border border-slate-800 active:bg-slate-800"
                  }`}
                >
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${active ? "bg-white/20 text-white" : "bg-slate-900 text-slate-500"}`}>
                    {idx + 1}
                  </span>
                  <span>{PART_LABELS[s.song.part as keyof typeof PART_LABELS]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chords Sheet Area — fullscreen, no SongViewer chrome */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            <SongViewer
              key={currentSong.id}
              song={currentSong}
              setlistSongId={currentSetlistSong.id}
              performanceMode
              initialKey={currentSetlistSong.selectedKey || currentSong.originalKey}
              onChangeKey={(newKey) => handleKeyChange(currentSetlistSong.songId, newKey)}
              fontSize={perfFontSize}
              onNextSong={handleNextPerformanceSong}
              onPrevSong={handlePrevPerformanceSong}
            />
          </AnimatePresence>
        </div>

        {/* Footer — sleek floating-style control dock */}
        <div className="backdrop-blur-xl bg-slate-900/95 border-t border-slate-800/80 px-3 py-2.5 pb-safe flex items-center justify-between gap-2">
          {/* Anterior */}
          <button
            onClick={handlePrevPerformanceSong}
            disabled={activePerformanceSongIdx === 0}
            className="flex items-center justify-center gap-1.5 bg-slate-800/90 border border-slate-700/60 active:bg-slate-700 disabled:opacity-30 text-white font-bold py-2 px-3.5 min-h-[42px] rounded-xl transition-all select-none text-xs sm:text-sm active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Anterior</span>
          </button>

          {/* Center: transpose + font pill */}
          <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 p-1 rounded-2xl">
            {/* Transpose */}
            <button
              onClick={() => handlePerfTranspose(-1)}
              className="bg-slate-800/90 active:bg-slate-700 text-white font-bold min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-sm transition-all active:scale-95"
              title="Transpor -1 Tom"
            >
              −
            </button>
            <div className="flex flex-col items-center justify-center min-w-[38px] px-1">
              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 leading-none">Tom</span>
              <span className="text-xs font-mono font-extrabold text-orange-400 leading-tight">
                {currentSetlistSong.selectedKey || currentSetlistSong.song.originalKey || "C"}
              </span>
            </div>
            <button
              onClick={() => handlePerfTranspose(1)}
              className="bg-slate-800/90 active:bg-slate-700 text-white font-bold min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-sm transition-all active:scale-95"
              title="Transpor +1 Tom"
            >
              +
            </button>

            <div className="w-px h-5 bg-slate-800 mx-0.5" />

            {/* Font size */}
            <button
              onClick={() => setPerfFontSize(f => Math.max(8, f - 1))}
              className="bg-slate-800/90 active:bg-slate-700 text-slate-200 font-bold min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-xs transition-all active:scale-95"
              title="Diminuir fonte"
            >
              A−
            </button>
            <span className="text-[11px] font-mono font-bold text-slate-400 min-w-[24px] text-center">{perfFontSize}</span>
            <button
              onClick={() => setPerfFontSize(f => Math.min(28, f + 1))}
              className="bg-slate-800/90 active:bg-slate-700 text-slate-200 font-bold min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-xs transition-all active:scale-95"
              title="Aumentar fonte"
            >
              A+
            </button>
          </div>

          {/* Próxima */}
          <button
            onClick={handleNextPerformanceSong}
            disabled={activePerformanceSongIdx === songs.length - 1}
            className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 active:from-violet-700 active:to-indigo-700 disabled:opacity-30 text-white font-bold py-2 px-3.5 min-h-[42px] rounded-xl transition-all select-none text-xs sm:text-sm active:scale-95 shadow-md shadow-violet-600/20"
          >
            <span className="hidden sm:inline">Próxima</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/50 dark:bg-slate-900/60 p-4 md:p-6 flex flex-col gap-5">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="flex items-center gap-2 flex-wrap">
          {songs.length > 0 && (
            <button
              onClick={() => {
                setActivePerformanceSongIdx(0);
                setIsPerformanceMode(true);
              }}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs md:text-sm font-bold py-2.5 px-4 min-h-[42px] rounded-xl flex items-center gap-2 transition-all shadow-md shadow-violet-500/25 active:scale-95"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Tocar Missa</span>
            </button>
          )}

          {/* Download Setlist */}
          {isDownloadingSetlist ? (
            <div className="flex items-center text-xs px-3 py-2 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 min-h-[42px]">
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              <span className="font-semibold">Salvando...</span>
            </div>
          ) : downloadedAt ? (
            <button
              disabled={!isOnline}
              onClick={handleDownloadSetlist}
              className="flex items-center text-xs px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 min-h-[42px] active:scale-95 transition-all disabled:opacity-50"
              title="Missa salva para uso offline!"
            >
              <Check className="w-4 h-4 mr-1.5" />
              <span className="font-semibold">Salvo Offline</span>
            </button>
          ) : (
            <button
              disabled={!isOnline}
              onClick={handleDownloadSetlist}
              className="flex items-center text-xs px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 min-h-[42px] active:scale-95 transition-all shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              title={isOnline ? "Salvar Missa Offline" : "Conecte-se para salvar"}
            >
              <CloudDownload className="w-4 h-4 mr-1.5 text-violet-500" />
              <span className="font-semibold">Salvar Offline</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="backdrop-blur-md bg-amber-500/10 dark:bg-amber-500/15 border border-amber-400/40 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-bold py-2 px-3.5 min-h-[42px] rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
            title="Compartilhar Repertório"
          >
            {shareFeedback ? <Check size={16} /> : <Share2 size={16} />}
            <span>{shareFeedback ? "Copiado!" : "Compartilhar"}</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold py-2 px-3 min-h-[42px] rounded-xl transition-all active:scale-95"
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      {/* Song list in setlist */}
      {songs.length === 0 ? (
        <div className="text-center p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white/50 dark:bg-slate-950/40">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
            {readOnly 
              ? "Nenhuma música neste repertório." 
              : "Nenhuma música neste repertório ainda. Adicione abaixo!"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <h3 className="text-[11px] uppercase font-extrabold tracking-wider text-slate-400 dark:text-slate-500 pl-1">
            Sequência Litúrgica ({songs.length})
          </h3>
          <div className="flex flex-col gap-2.5">
            {songs.map((s, index) => {
              const displayKey = s.selectedKey || s.song.originalKey;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSetlistSong(s)}
                  className="group flex items-center justify-between p-3 bg-white dark:bg-slate-950/90 border border-slate-200/80 dark:border-slate-800/80 hover:border-violet-300 dark:hover:border-violet-700/70 rounded-2xl transition-all cursor-pointer active:scale-[0.99] shadow-[0_1px_6px_rgba(0,0,0,0.02)] gap-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-xs font-mono font-extrabold text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                          {s.song.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PART_COLORS[s.song.part as keyof typeof PART_COLORS]}`}>
                          {PART_LABELS[s.song.part as keyof typeof PART_LABELS]}
                        </span>
                        {displayKey && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/50">
                            Tom: {displayKey}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!readOnly && (
                    <div
                      className="flex items-center gap-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleMove(index, "up")}
                        disabled={index === 0}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800 disabled:opacity-20 rounded-xl transition-all active:scale-95"
                        title="Mover para cima"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleMove(index, "down")}
                        disabled={index === songs.length - 1}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800 disabled:opacity-20 rounded-xl transition-all active:scale-95"
                        title="Mover para baixo"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleRemove(s.songId)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-rose-500 active:text-rose-600 active:bg-rose-50 dark:active:bg-rose-950/40 rounded-xl transition-all active:scale-95"
                        title="Remover"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Formulário de Adição Rápida */}
      {!readOnly && (
        <form onSubmit={handleQuickAdd} className="bg-white dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-1">
          <input 
            type="text" 
            placeholder="Adicionar música rápida..." 
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-slate-900 dark:text-slate-100"
          />
          <div className="flex items-center gap-2">
            <select
              value={quickPart}
              onChange={(e) => setQuickPart(e.target.value)}
              className="flex-1 sm:flex-initial bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl py-2.5 px-3 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-slate-900 dark:text-slate-100"
            >
              {Object.entries(PART_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isQuickAdding || !quickTitle.trim()}
              className="min-h-[40px] bg-violet-600 active:bg-violet-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-xl text-xs sm:text-sm transition-all active:scale-95 shadow-sm whitespace-nowrap"
            >
              {isQuickAdding ? "..." : "+ Adicionar"}
            </button>
          </div>
        </form>
      )}

      {/* Song Viewer Fullscreen Overlay Modal */}
      {selectedSetlistSong && (
        <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950">
          <AnimatePresence mode="wait">
            <SongViewer
              key={selectedSetlistSong.song.id}
              song={selectedSetlistSong.song}
              setlistSongId={selectedSetlistSong.id}
              initialKey={selectedSetlistSong.selectedKey || selectedSetlistSong.song.originalKey}
              onChangeKey={(newKey) => handleKeyChange(selectedSetlistSong.songId, newKey)}
              onNextSong={handleNextModalSong}
              onPrevSong={handlePrevModalSong}
              onClose={() => {
                setSelectedSetlistSong(null);
                loadSetlistDetails();
              }}
              showBackButton={true}
            />
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
