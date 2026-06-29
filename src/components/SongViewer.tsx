"use client";

import React, { useState, useMemo } from "react";
import { Song, Setlist } from "@/generated/prisma/client";
import { transposeLine, getPreferredScale } from "@/utils/chordTransposer";
import { PART_LABELS, PART_COLORS } from "@/utils/labels";
import { addSongToSetlist } from "@/app/actions";

interface SongViewerProps {
  song: Song;
  setlists?: Setlist[];
  onClose?: () => void;
  showBackButton?: boolean;
}

export default function SongViewer({ song, setlists = [], onClose, showBackButton = false }: SongViewerProps) {
  const [semitones, setSemitones] = useState(0);
  const [fontSize, setFontSize] = useState(16); // px
  const [selectedSetlistId, setSelectedSetlistId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  const preferredScale = useMemo(() => {
    return getPreferredScale(song.content);
  }, [song.content]);

  // Transpose the notes scale to show the current key
  const currentKey = useMemo(() => {
    if (semitones === 0) return song.originalKey;
    
    // Simple transposition of the original key string
    // Extract root
    const match = song.originalKey.match(/^([A-G](?:#|b)?)(.*)$/);
    if (!match) return song.originalKey;
    const [, root, extension] = match;

    const NOTE_TO_SEMITONE: { [key: string]: number } = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
      'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };

    const currentSemitone = NOTE_TO_SEMITONE[root];
    if (currentSemitone === undefined) return song.originalKey;

    let newSemitone = (currentSemitone + semitones) % 12;
    if (newSemitone < 0) newSemitone += 12;

    return preferredScale[newSemitone] + extension;
  }, [song.originalKey, semitones, preferredScale]);

  const renderedLines = useMemo(() => {
    return song.content.split("\n").map((line, idx) => {
      const isHeader = line.trim().startsWith("[") && line.trim().endsWith("]");
      
      // Let's check if it's a chord line
      const clean = line.trim();
      if (!clean) {
        return { type: "empty", content: "", original: line, key: idx };
      }
      
      if (isHeader) {
        return { type: "header", content: line.trim(), original: line, key: idx };
      }

      // Check if it is a chord line using our transposition function check
      const isChords = transposeLine(line, 0, preferredScale) !== line || 
                      // or if it strictly passes the chord line check
                      line.split(/\s+/).filter(t => t.trim().length > 0).every(t => {
                        const cleanT = t.trim();
                        if (/^[|:\-\[\]()+]+$/.test(cleanT)) return true;
                        return /^[A-G](?:#|b)?(?:m|M|maj|min|dim|aug|sus|add|no)?\d*(?:b5|#5|b9|#9)?(?:\([^)]+\))?(?:\/[A-G](?:#|b)?)?$/.test(cleanT);
                      }) && line.split(/\s+/).filter(t => t.trim().length > 0 && !/^[|:\-\[\]()+]+$/.test(t.trim())).length > 0;

      if (isChords) {
        const transposed = transposeLine(line, semitones, preferredScale);
        return { type: "chords", content: transposed, original: line, key: idx };
      } else {
        return { type: "lyrics", content: line, original: line, key: idx };
      }
    });
  }, [song.content, semitones, preferredScale]);

  const handleAddToSetlist = async () => {
    if (!selectedSetlistId) return;
    setIsAdding(true);
    setMessage({ text: "", type: "" });
    try {
      const res = await addSongToSetlist(selectedSetlistId, song.id);
      if (res.success) {
        setMessage({ text: "Adicionada ao repertório!", type: "success" });
        setTimeout(() => setMessage({ text: "", type: "" }), 3000);
      } else {
        setMessage({ text: `Erro: ${res.error}`, type: "error" });
      }
    } catch (e: any) {
      setMessage({ text: `Erro de conexão: ${e.message}`, type: "error" });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sticky top control bar */}
      <div className="sticky top-0 z-20 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            {showBackButton && onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                title="Voltar"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">{song.title}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{song.artist}</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PART_COLORS[song.part]} ml-2`}>
              {PART_LABELS[song.part]}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Transposition Buttons */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setSemitones(s => s - 1)}
                className="px-3 py-1.5 text-sm font-semibold hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-md transition-all active:scale-95"
              >
                - Tom
              </button>
              <div className="px-4 py-1 text-xs md:text-sm font-mono font-bold text-center min-w-[70px]">
                {currentKey}
                {semitones !== 0 && (
                  <span className="text-xs block text-orange-500">
                    {semitones > 0 ? `+${semitones}` : semitones}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSemitones(s => s + 1)}
                className="px-3 py-1.5 text-sm font-semibold hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-md transition-all active:scale-95"
              >
                + Tom
              </button>
            </div>

            {/* Font Size Adjust */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setFontSize(f => Math.max(12, f - 2))}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-700"
                title="Diminuir fonte"
              >
                <span className="text-xs font-bold font-sans">A-</span>
              </button>
              <span className="text-xs px-1 font-mono font-semibold">{fontSize}px</span>
              <button
                onClick={() => setFontSize(f => Math.min(28, f + 2))}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-700"
                title="Aumentar fonte"
              >
                <span className="text-xs font-bold font-sans">A+</span>
              </button>
            </div>

            {/* Add to Setlist controls */}
            {setlists.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedSetlistId}
                  onChange={(e) => setSelectedSetlistId(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-3 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">Selecione a Missa...</option>
                  {setlists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddToSetlist}
                  disabled={!selectedSetlistId || isAdding}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-semibold py-1.5 px-4 rounded-lg text-xs md:text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md active:scale-95"
                >
                  {isAdding ? "Adicionando..." : "Adicionar"}
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Feedback message banner */}
        {message.text && (
          <div className="max-w-4xl mx-auto mt-2">
            <div
              className={`p-2 rounded-md text-xs font-semibold text-center border ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
                  : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50"
              }`}
            >
              {message.text}
            </div>
          </div>
        )}
      </div>

      {/* Chords rendering sheet */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:py-10">
        <div 
          className="max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-10 shadow-sm leading-relaxed"
          style={{ fontSize: `${fontSize}px` }}
        >
          {renderedLines.map((line) => {
            if (line.type === "empty") {
              return <div key={line.key} className="h-4" />;
            }
            if (line.type === "header") {
              return (
                <div
                  key={line.key}
                  className="font-sans font-bold text-slate-400 dark:text-slate-500 select-none border-b border-slate-100 dark:border-slate-800/80 pb-1 mt-6 mb-2 text-[0.85em] uppercase tracking-wider"
                >
                  {line.content}
                </div>
              );
            }
            if (line.type === "chords") {
              return (
                <div
                  key={line.key}
                  className="font-mono font-bold text-orange-600 dark:text-orange-400 select-all whitespace-pre leading-none pb-1 pt-2"
                  style={{ letterSpacing: "normal" }}
                >
                  {line.content}
                </div>
              );
            }
            // Otherwise, it's lyric line
            return (
              <div
                key={line.key}
                className="font-sans text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed pb-1"
              >
                {line.content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
