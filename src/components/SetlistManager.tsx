"use client";

import React, { useState, useEffect } from "react";
import { Setlist, Song } from "@/generated/prisma/client";
import { getSetlistWithSongs, removeSongFromSetlist, updateSetlistOrder, createSong, addSongToSetlist, updateSetlistSongKey } from "@/app/actions";
import { PART_LABELS, PART_COLORS } from "@/utils/labels";
import { getTransposedKey, getPreferredScale } from "@/utils/chordTransposer";
import SongViewer from "./SongViewer";
import { db } from "@/lib/db-local";
import { useOfflineSync } from "./OfflineSyncManager";
import { Share2, Check, CloudDownload, Loader2 } from "lucide-react";

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

  const handleKeyChange = async (songId: string, newKey: string | null) => {
    // 1. Optimistic UI update
    setSongs(prev => prev.map(s => s.songId === songId ? { ...s, selectedKey: newKey } : s));

    if (selectedSetlistSong && selectedSetlistSong.songId === songId) {
      setSelectedSetlistSong(prev => prev ? { ...prev, selectedKey: newKey } : prev);
    }

    // 2. Local DB update
    if (setlist) {
      const localSetlist = await db.setlists.get(setlistId);
      if (localSetlist) {
        localSetlist.songs = localSetlist.songs.map((s: any) => 
          s.songId === songId ? { ...s, selectedKey: newKey } : s
        );
        await db.setlists.put(localSetlist);
      }
    }

    // 3. Online/Offline Sync
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
        {/* Performance Top Bar — compact */}
        <div className="bg-slate-900 border-b border-slate-800 px-2 py-1.5 flex items-center gap-2">
          <button
            onClick={() => setIsPerformanceMode(false)}
            className="bg-slate-800 active:bg-slate-700 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-200 shrink-0 active:scale-95 transition-all"
            title="Sair do Modo de Execução"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Quick select buttons — fill remaining space */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto p-0.5 bg-slate-950 rounded-lg min-w-0">
            {songs.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setActivePerformanceSongIdx(idx)}
                className={`text-[10px] font-semibold px-2 py-1.5 rounded-md transition-all whitespace-nowrap shrink-0 ${
                  idx === activePerformanceSongIdx
                    ? "bg-violet-600 text-white font-bold"
                    : "bg-slate-900 text-slate-400 active:bg-slate-850"
                } min-h-[44px] flex items-center`}
              >
                {idx + 1}. {PART_LABELS[s.song.part as keyof typeof PART_LABELS]}
              </button>
            ))}
          </div>
        </div>

        {/* Chords Sheet Area — fullscreen, no SongViewer chrome */}
        <div className="flex-1 overflow-y-auto">
          <SongViewer
            song={currentSong}
            performanceMode
            initialKey={currentSetlistSong.selectedKey || currentSong.originalKey}
            fontSize={perfFontSize}
          />
        </div>

        {/* Footer — compact controls + navigation */}
        <div className="bg-slate-900 border-t border-slate-800 px-2 py-2 flex items-center justify-between gap-1">
          {/* Anterior */}
          <button
            onClick={() => setActivePerformanceSongIdx(prev => Math.max(0, prev - 1))}
            disabled={activePerformanceSongIdx === 0}
            className="flex items-center justify-center gap-1 bg-slate-800 active:bg-slate-700 disabled:opacity-30 text-white font-bold py-2 px-3 min-h-[44px] rounded-lg transition-all select-none text-sm active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Anterior</span>
          </button>

          {/* Center: transpose + font */}
          <div className="flex items-center gap-1">
            {/* Transpose */}
            <button
              onClick={() => handlePerfTranspose(-1)}
              className="bg-slate-800 active:bg-slate-700 text-white font-bold min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-sm transition-all active:scale-95"
              title="Transpor -1 Tom"
            >
              −
            </button>
            <span className="text-[12px] font-mono font-bold text-orange-400 min-w-[32px] text-center">
              {currentSetlistSong.selectedKey || currentSetlistSong.song.originalKey || "Tom"}
            </span>
            <button
              onClick={() => handlePerfTranspose(1)}
              className="bg-slate-800 active:bg-slate-700 text-white font-bold min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-sm transition-all active:scale-95"
              title="Transpor +1 Tom"
            >
              +
            </button>

            <div className="w-px h-5 bg-slate-700 mx-1" />

            {/* Font size */}
            <button
              onClick={() => setPerfFontSize(f => Math.max(10, f - 1))}
              className="bg-slate-800 active:bg-slate-700 text-white font-bold min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-xs transition-all active:scale-95"
              title="Diminuir fonte"
            >
              A−
            </button>
            <span className="text-[12px] font-mono font-bold text-slate-400 min-w-[28px] text-center">{perfFontSize}</span>
            <button
              onClick={() => setPerfFontSize(f => Math.min(28, f + 1))}
              className="bg-slate-800 active:bg-slate-700 text-white font-bold min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-xs transition-all active:scale-95"
              title="Aumentar fonte"
            >
              A+
            </button>
          </div>

          {/* Próxima */}
          <button
            onClick={() => setActivePerformanceSongIdx(prev => Math.min(songs.length - 1, prev + 1))}
            disabled={activePerformanceSongIdx === songs.length - 1}
            className="flex items-center justify-center gap-1 bg-slate-800 active:bg-slate-700 disabled:opacity-30 text-white font-bold py-2 px-3 min-h-[44px] rounded-lg transition-all select-none text-sm active:scale-95"
          >
            <span className="hidden sm:inline">Próxima</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 md:p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-950 dark:text-slate-50">{setlist.title}</h2>
          <p className="text-xs text-slate-500 mt-1" suppressHydrationWarning>
            Data: {new Date(setlist.date).toLocaleDateString("pt-BR", { dateStyle: "long" })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={handleShare}
            className="relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-amber-400/20 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-600/10 border border-amber-400/40 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs md:text-sm font-bold py-2 px-3 md:px-4 min-h-[44px] rounded-xl flex items-center gap-1.5 transition-all duration-300 shadow-[0_4px_16px_rgba(245,158,11,0.15)] dark:shadow-[0_4px_16px_rgba(251,191,36,0.1)] hover:shadow-[0_4px_20px_rgba(245,158,11,0.25)] dark:hover:shadow-[0_4px_20px_rgba(251,191,36,0.2)] active:scale-95 hover:bg-amber-400/30 dark:hover:bg-amber-500/30 hover:border-amber-500/50 dark:hover:border-amber-400/50"
            title="Compartilhar Repertório"
          >
            {shareFeedback ? <Check size={18} /> : <Share2 size={18} />}
            <span className="hidden sm:inline">
              {shareFeedback ? "Link Copiado!" : "Compartilhar"}
            </span>
          </button>
          
          {/* Download Setlist */}
          {isDownloadingSetlist ? (
             <div className="flex items-center text-xs md:text-sm px-3 py-1.5 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 min-h-[44px]">
               <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
               <span className="hidden sm:inline font-medium">Salvando...</span>
             </div>
          ) : downloadedAt ? (
             <button
                disabled={!isOnline}
                onClick={handleDownloadSetlist}
                className="flex items-center text-xs md:text-sm px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 min-h-[44px] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Missa salva para uso offline!"
             >
                <Check className="w-4 h-4 mr-1.5" />
                <span className="hidden sm:inline font-medium">Salvo Offline</span>
             </button>
          ) : (
             <button
                disabled={!isOnline}
                onClick={handleDownloadSetlist}
                className="flex items-center text-xs md:text-sm px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 min-h-[44px] active:scale-95 transition-all shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isOnline ? "Salvar Missa Offline" : "Conecte-se para salvar"}
             >
                <CloudDownload className="w-4 h-4 mr-1.5 text-violet-500" />
                <span className="hidden sm:inline font-semibold">Salvar Missa</span>
             </button>
          )}

          {songs.length > 0 && (
            <button
              onClick={() => {
                setActivePerformanceSongIdx(0);
                setIsPerformanceMode(true);
              }}
              className="bg-violet-600 active:bg-violet-700 text-white text-xs md:text-sm font-semibold py-2 px-4 min-h-[44px] rounded-xl flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Tocar Missa
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="border border-slate-200 dark:border-slate-800 active:bg-slate-50 dark:active:bg-slate-850 text-slate-600 dark:text-slate-400 py-2 px-3 min-h-[44px] rounded-xl transition-all active:scale-95"
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      {/* Song list in setlist */}
      {songs.length === 0 ? (
        <div className="text-center p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl mb-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {readOnly 
              ? "Nenhuma música neste repertório." 
              : "Nenhuma música neste repertório ainda. Adicione abaixo!"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          <h3 className="text-xs uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 pl-1">
            Sequência de Músicas
          </h3>
          <div className="flex flex-col gap-3">
            {songs.map((s, index) => (
              <div
                key={s.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850/80 rounded-xl transition-all active:scale-[0.98] active:bg-slate-100 dark:active:bg-slate-900 gap-3 sm:gap-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500 w-5">
                    {index + 1}
                  </span>
                  <div
                    onClick={() => setSelectedSetlistSong(s)}
                    className="min-w-0 cursor-pointer group/title"
                    title="Clique para ver a cifra"
                  >
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate active:text-violet-600 dark:active:text-violet-400">
                      {s.song.title}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{s.song.artist}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PART_COLORS[s.song.part as keyof typeof PART_COLORS]}`}>
                    {PART_LABELS[s.song.part as keyof typeof PART_LABELS]}
                  </span>

                  {!readOnly && (
                    <div className="flex items-center gap-1 sm:border-l border-slate-200 dark:border-slate-800/80 sm:pl-3">
                      <button
                        onClick={() => handleMove(index, "up")}
                        disabled={index === 0}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 active:bg-slate-200 dark:active:bg-slate-800 disabled:opacity-20 rounded-md transition-all active:scale-95"
                        title="Mover para cima"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleMove(index, "down")}
                        disabled={index === songs.length - 1}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 active:bg-slate-200 dark:active:bg-slate-800 disabled:opacity-20 rounded-md transition-all active:scale-95"
                        title="Mover para baixo"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleRemove(s.songId)}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-rose-500 active:bg-rose-100 dark:active:bg-rose-950/40 rounded-md transition-all active:scale-95"
                        title="Remover"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulário de Adição Rápida */}
      {!readOnly && (
        <form onSubmit={handleQuickAdd} className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-auto">
          <input 
            type="text" 
            placeholder="Nome da música (Adição rápida)" 
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900 dark:text-slate-100"
          />
          <div className="flex items-center gap-2">
            <select
              value={quickPart}
              onChange={(e) => setQuickPart(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-900 dark:text-slate-100"
            >
              {Object.entries(PART_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isQuickAdding || !quickTitle.trim()}
              className="min-h-[44px] bg-violet-600 active:bg-violet-700 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-all active:scale-95 shadow-sm whitespace-nowrap"
            >
              {isQuickAdding ? "Adicionando..." : "Adicionar"}
            </button>
          </div>
        </form>
      )}

      {/* Song Viewer Fullscreen Overlay Modal */}
      {selectedSetlistSong && (
        <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950">
          <SongViewer
            song={selectedSetlistSong.song}
            initialKey={selectedSetlistSong.selectedKey || selectedSetlistSong.song.originalKey}
            onChangeKey={(newKey) => handleKeyChange(selectedSetlistSong.songId, newKey)}
            onClose={() => {
              setSelectedSetlistSong(null);
              loadSetlistDetails();
            }}
            showBackButton={true}
          />
        </div>
      )}
    </div>
  );
}
