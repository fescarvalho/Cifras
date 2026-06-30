"use client";

import React, { useState, useEffect } from "react";
import { Setlist, Song } from "@/generated/prisma/client";
import { getSetlistWithSongs, removeSongFromSetlist, updateSetlistOrder } from "@/app/actions";
import { PART_LABELS, PART_COLORS } from "@/utils/labels";
import SongViewer from "./SongViewer";

interface SetlistManagerProps {
  setlistId: string;
  onClose?: () => void;
  onRefreshSetlists?: () => void;
}

interface SetlistSongWithModel {
  id: string;
  setlistId: string;
  songId: string;
  order: number;
  song: Song;
}

export default function SetlistManager({ setlistId, onClose, onRefreshSetlists }: SetlistManagerProps) {
  const [setlist, setSetlist] = useState<any>(null);
  const [songs, setSongs] = useState<SetlistSongWithModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const [activePerformanceSongIdx, setActivePerformanceSongIdx] = useState(0);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  const loadSetlistDetails = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getSetlistWithSongs(setlistId);
      if (data) {
        setSetlist(data);
        setSongs(data.songs as any[]);
      } else {
        setError("Repertório não encontrado.");
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

  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= songs.length) return;

    // Swap songs in local state
    const newSongs = [...songs];
    const temp = newSongs[index];
    newSongs[index] = newSongs[targetIdx];
    newSongs[targetIdx] = temp;

    // Optimistic state update
    setSongs(newSongs);

    // Save to DB
    const songIdsInOrder = newSongs.map(s => s.songId);
    try {
      const res = await updateSetlistOrder(setlistId, songIdsInOrder);
      if (!res.success) {
        // Rollback
        loadSetlistDetails();
      } else if (onRefreshSetlists) {
        onRefreshSetlists();
      }
    } catch (e) {
      loadSetlistDetails();
    }
  };

  const handleRemove = async (songId: string) => {
    const confirm = window.confirm("Deseja realmente remover esta música do repertório?");
    if (!confirm) return;

    // Optimistic delete
    setSongs(prev => prev.filter(s => s.songId !== songId));

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
    const currentSong = songs[activePerformanceSongIdx].song;

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100">
        {/* Performance Top Bar */}
        <div className="bg-slate-900 border-b border-slate-800 p-3 md:p-4 flex items-center gap-3">
          <button
            onClick={() => setIsPerformanceMode(false)}
            className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg text-slate-200 shrink-0"
            title="Sair do Modo de Execução"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="hidden md:block shrink-0">
            <span className="text-xs uppercase font-bold tracking-wider text-violet-400">
              Modo de Missa ({activePerformanceSongIdx + 1} de {songs.length})
            </span>
            <h2 className="text-lg font-bold truncate max-w-[200px] lg:max-w-xs">{setlist.title}</h2>
          </div>

          {/* Quick select buttons */}
          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto p-1 bg-slate-950 rounded-lg min-w-0">
            {songs.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setActivePerformanceSongIdx(idx)}
                className={`text-[10px] md:text-xs font-semibold px-3 py-2 rounded-md transition-all whitespace-nowrap shrink-0 ${
                  idx === activePerformanceSongIdx
                    ? "bg-violet-600 text-white font-bold"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-850"
                }`}
              >
                {idx + 1}. {PART_LABELS[s.song.part]}
              </button>
            ))}
          </div>
        </div>

        {/* Chords Sheet Area */}
        <div className="flex-1 overflow-y-auto">
          <SongViewer song={currentSong} />
        </div>

        {/* Footer Navigation Bar */}
        <div className="bg-slate-900 border-t border-slate-800 p-4 flex items-center justify-between shadow-lg">
          <button
            onClick={() => setActivePerformanceSongIdx(prev => Math.max(0, prev - 1))}
            disabled={activePerformanceSongIdx === 0}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-xl transition-all select-none"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Anterior
          </button>

          <span className="text-sm font-mono text-slate-400 font-semibold select-none">
            {songs[activePerformanceSongIdx].song.title}
          </span>

          <button
            onClick={() => setActivePerformanceSongIdx(prev => Math.min(songs.length - 1, prev + 1))}
            disabled={activePerformanceSongIdx === songs.length - 1}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-xl transition-all select-none"
          >
            Próxima
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          <p className="text-xs text-slate-500 mt-1">
            Data: {new Date(setlist.date).toLocaleDateString("pt-BR", { dateStyle: "long" })}
          </p>
        </div>
        <div className="flex gap-2">
          {songs.length > 0 && (
            <button
              onClick={() => {
                setActivePerformanceSongIdx(0);
                setIsPerformanceMode(true);
              }}
              className="bg-violet-600 hover:bg-violet-700 text-white text-xs md:text-sm font-semibold py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all shadow-sm hover:shadow active:scale-95"
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
              className="border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400 py-2 px-3 rounded-xl transition-all"
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      {/* Song list in setlist */}
      {songs.length === 0 ? (
        <div className="text-center p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nenhuma música neste repertório ainda. Pesquise músicas ao lado e clique em "Adicionar"!
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 pl-1">
            Sequência de Músicas
          </h3>
          <div className="flex flex-col gap-3">
            {songs.map((s, index) => (
              <div
                key={s.id}
                className="group flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850/80 rounded-xl hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500 w-5">
                    {index + 1}
                  </span>
                  <div
                    onClick={() => setSelectedSong(s.song)}
                    className="min-w-0 cursor-pointer group/title"
                    title="Clique para ver a cifra"
                  >
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate group-hover/title:text-violet-600 dark:group-hover/title:text-violet-400 group-hover/title:underline decoration-violet-500/30">
                      {s.song.title}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{s.song.artist}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PART_COLORS[s.song.part]}`}>
                    {PART_LABELS[s.song.part]}
                  </span>

                  {/* Ordering arrows */}
                  <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800/80 pl-3">
                    <button
                      onClick={() => handleMove(index, "up")}
                      disabled={index === 0}
                      className="p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-20 rounded-md transition-colors"
                      title="Mover para cima"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleMove(index, "down")}
                      disabled={index === songs.length - 1}
                      className="p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-20 rounded-md transition-colors"
                      title="Mover para baixo"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRemove(s.songId)}
                      className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-md transition-colors"
                      title="Remover"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Song Viewer Fullscreen Overlay Modal */}
      {selectedSong && (
        <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950">
          <SongViewer
            song={selectedSong}
            onClose={() => {
              setSelectedSong(null);
              loadSetlistDetails();
            }}
            showBackButton={true}
          />
        </div>
      )}
    </div>
  );
}
