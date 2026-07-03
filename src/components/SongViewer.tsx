"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import { Song, Setlist } from "@/generated/prisma/client";
import { transposeLine, getPreferredScale, isChordLine, sanitizePdfText, getSemitoneDifference, getTransposedKey } from "@/utils/chordTransposer";
import { PART_LABELS, PART_COLORS, SEASON_LABELS } from "@/utils/labels";
import { addSongToSetlist, updateSongContent } from "@/app/actions";
import { useOfflineSync } from "./OfflineSyncManager";
import { db } from "@/lib/db-local";

interface SongViewerProps {
  song: Song;
  setlists?: Setlist[];
  onClose?: () => void;
  showBackButton?: boolean;
  performanceMode?: boolean;
  semitones?: number;
  fontSize?: number;
  initialKey?: string | null;
  onChangeKey?: (newKey: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// WYSIWYG Chord Editor (Overlay method)
// Identical SHARED_STYLE applied to both <pre> and <textarea> guarantees
// pixel-perfect caret alignment.
// ─────────────────────────────────────────────────────────────────────────────
const EDITOR_FONT: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: "14px",
  lineHeight: "1.65",
  padding: "20px 24px",
  margin: 0,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  wordBreak: "break-all",
  tabSize: 2,
  letterSpacing: 0,
};

function buildHighlight(text: string): React.ReactNode {
  const lines = (text.endsWith("\n") ? text : text + "\n").split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    const isLast = i === lines.length - 1;

    if (!trimmed) {
      return (
        <span key={i} style={{ display: "block", minHeight: "1.65em" }}>
          {isLast ? null : "\u00A0"}
        </span>
      );
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return (
        <span key={i} style={{ display: "block", color: "#94a3b8", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.8em" }}>
          {line + "\n"}
        </span>
      );
    }
    if (isChordLine(line)) {
      const introMatch = line.match(/^(\s*(?:intro(?:du[cç][aã]o)?)[:.\-]*\s*)(.*)$/i);
      if (introMatch) {
        return (
          <span key={i} style={{ display: "block" }}>
            <span style={{ color: "#e2e8f0" }}>{introMatch[1]}</span>
            <span style={{ color: "#f97316", fontWeight: 700 }}>{introMatch[2] + "\n"}</span>
          </span>
        );
      }
      return (
        <span key={i} style={{ display: "block", color: "#f97316", fontWeight: 700 }}>
          {line + "\n"}
        </span>
      );
    }
    return (
      <span key={i} style={{ display: "block", color: "#e2e8f0" }}>
        {line + "\n"}
      </span>
    );
  });
}

function ChordEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const handleScroll = useCallback(() => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "12px",
        border: "1.5px solid #334155",
        overflow: "hidden",
        minHeight: "320px",
        background: "#0f172a",
      }}
    >
      {/* Highlight layer */}
      <pre
        ref={preRef}
        aria-hidden="true"
        style={{
          ...EDITOR_FONT,
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
          userSelect: "none",
          background: "transparent",
          color: "#e2e8f0",
          minHeight: "320px",
        }}
      >
        {buildHighlight(value)}
      </pre>

      {/* Transparent input layer */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        style={{
          ...EDITOR_FONT,
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          minHeight: "320px",
          background: "transparent",
          color: "transparent",
          caretColor: "#f8fafc",
          border: "none",
          outline: "none",
          resize: "none",
          overflow: "auto",
          zIndex: 1,
        }}
      />

      {/* Ghost div to stretch the container height */}
      <div
        aria-hidden="true"
        style={{
          ...EDITOR_FONT,
          visibility: "hidden",
          pointerEvents: "none",
          minHeight: "320px",
        }}
      >
        {value.endsWith("\n") ? value + " " : value + "\n "}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Save status types
// ─────────────────────────────────────────────────────────────────────────────
type SaveStatus = "idle" | "saving" | "saved" | "error";

// ─────────────────────────────────────────────────────────────────────────────
// Main SongViewer
// ─────────────────────────────────────────────────────────────────────────────
export default function SongViewer({ song, setlists = [], onClose, showBackButton = false, performanceMode = false, semitones: externalSemitones, fontSize: externalFontSize, initialKey, onChangeKey }: SongViewerProps) {
  const [internalSemitones, setInternalSemitones] = useState(() => {
    if (initialKey && initialKey !== song.originalKey) {
      return getSemitoneDifference(song.originalKey, initialKey);
    }
    return 0;
  });
  const [internalFontSize, setInternalFontSize] = useState(16);

  const semitones = externalSemitones ?? internalSemitones;
  const setSemitones = setInternalSemitones;
  const fontSize = externalFontSize ?? internalFontSize;
  const setFontSize = setInternalFontSize;
  const [selectedSetlistId, setSelectedSetlistId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(song.content);
  const [editTitle, setEditTitle] = useState(song.title);
  const [editArtist, setEditArtist] = useState(song.artist);
  const [editPart, setEditPart] = useState(song.part);
  const [editSeason, setEditSeason] = useState(song.season || "ALL");
  const [editReferenceUrl, setEditReferenceUrl] = useState(song.referenceUrl || "");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const preferredScale = useMemo(() => getPreferredScale(song.content), [song.content]);

  const currentKey = useMemo(() => {
    return getTransposedKey(song.originalKey, semitones, preferredScale);
  }, [song.originalKey, semitones, preferredScale]);

  // Hook to notify parent component when currentKey changes via UI interactions
  React.useEffect(() => {
    if (onChangeKey && currentKey) {
      onChangeKey(currentKey);
    }
  }, [currentKey, onChangeKey]);

  const renderedLines = useMemo(() => {
    const sanitized = sanitizePdfText(song.content ?? "");

    // Splits glued chords like "C#G#7" → "C#  G#7"
    // Looks for a capital letter A-G that starts a new chord mid-token
    const splitGluedChords = (line: string): string => {
      // Only try on lines that look like they could be chord lines (short, no lowercase words)
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > 120) return line;
      // If it already has spaces and is detected as a chord line, leave it
      if (isChordLine(line)) return line;
      // Try splitting: insert space before uppercase A-G that follows a non-space character
      // but only if the character before is a digit, #, b, m, or lowercase letter (chord suffix)
      const split = trimmed.replace(/([#b\dm\d)])([A-G](?:#|b)?(?:m|M|maj|min|dim|aug|sus|add)?)/g, '$1  $2');
      if (split !== trimmed && isChordLine(split)) {
        // Preserve leading whitespace
        const leading = line.length - line.trimStart().length;
        return ' '.repeat(leading) + split;
      }
      return line;
    };

    return sanitized.split("\n").map((rawLine, idx) => {
      const line = splitGluedChords(rawLine);
      const trimmed = line.trim();
      if (!trimmed) return { type: "empty", content: "", key: idx };
      if (trimmed.startsWith("[") && trimmed.endsWith("]"))
        return { type: "header", content: trimmed, key: idx };
      if (isChordLine(line)) {
        return { type: "chords", content: transposeLine(line, semitones, preferredScale), key: idx };
      }
      return { type: "lyrics", content: rawLine, key: idx };
    });
  }, [song.content, semitones, preferredScale]);

  const handleAddToSetlist = async () => {
    if (!selectedSetlistId) return;
    setIsAdding(true);
    setMessage({ text: "", type: "" });
    try {
      if (isOnline && !selectedSetlistId.startsWith('temp_')) {
        const res = await addSongToSetlist(selectedSetlistId, song.id);
        if (res.success) {
          // Update local DB so it shows up instantly without reloading
          const localSetlist = await db.setlists.get(selectedSetlistId);
          if (localSetlist) {
            const newOrder = localSetlist.songs.length > 0 ? Math.max(...localSetlist.songs.map(s => s.order)) + 1 : 1;
            localSetlist.songs.push({
              id: `rel_${Date.now()}`,
              setlistId: selectedSetlistId,
              songId: song.id,
              order: newOrder,
              song: song as any
            });
            await db.setlists.put(localSetlist);
          }

          setMessage({ text: "Adicionada ao repertório!", type: "success" });
          setTimeout(() => setMessage({ text: "", type: "" }), 3000);
        } else {
          setMessage({ text: `Erro: ${res.error}`, type: "error" });
        }
      } else {
        // Offline add to setlist
        const localSetlist = await db.setlists.get(selectedSetlistId);
        if (localSetlist) {
          // Check if already in setlist
          if (localSetlist.songs.some(s => s.songId === song.id)) {
             setMessage({ text: "A música já está no repertório.", type: "error" });
             setIsAdding(false);
             return;
          }
          
          const newOrder = localSetlist.songs.length > 0 ? Math.max(...localSetlist.songs.map(s => s.order)) + 1 : 1;
          localSetlist.songs.push({
            id: `temp_song_${Date.now()}`,
            setlistId: selectedSetlistId,
            songId: song.id,
            order: newOrder,
            song: song as any
          });
          
          await db.setlists.put(localSetlist);
          
          await db.syncQueue.add({
            action: 'ADD_SONG_TO_SETLIST',
            payload: { setlistId: selectedSetlistId, songId: song.id },
            createdAt: new Date()
          });
          
          setMessage({ text: "Adicionada offline ao repertório!", type: "success" });
          setTimeout(() => setMessage({ text: "", type: "" }), 3000);
        } else {
          setMessage({ text: "Repertório local não encontrado.", type: "error" });
        }
      }
    } catch (e: any) {
      setMessage({ text: `Erro: ${e.message}`, type: "error" });
    } finally {
      setIsAdding(false);
    }
  };

  const { isOnline } = useOfflineSync();

  const handleSaveEdit = async () => {
    if (!isOnline) {
      alert("Sem conexão para salvar.");
      return;
    }
    setSaveStatus("saving");
    try {
      const dataToUpdate = {
        content: editContent,
        title: editTitle,
        artist: editArtist,
        part: editPart,
        season: editSeason === "ALL" ? null : editSeason,
        referenceUrl: editReferenceUrl || null,
      };
      
      const res = await updateSongContent(song.id, dataToUpdate);
      if (res.success) {
        setSaveStatus("saved");
        // Update local Dexie first for instant read feedback
        await db.songs.update(song.id, dataToUpdate as any);

        // Patch the local song object so renderedLines and UI re-computes with new content
        song.content = editContent;
        song.title = editTitle;
        song.artist = editArtist;
        song.part = editPart;
        song.season = (editSeason === "ALL" ? null : editSeason) as any;
        song.referenceUrl = editReferenceUrl || null;
        setTimeout(() => setSaveStatus("idle"), 2500);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(song.content);
    setEditTitle(song.title);
    setEditArtist(song.artist);
    setEditPart(song.part);
    setEditSeason(song.season || "ALL");
    setEditReferenceUrl(song.referenceUrl || "");
    setIsEditing(false);
    setSaveStatus("idle");
  };

  const saveLabel: Record<SaveStatus, string> = {
    idle: "Salvar Alterações",
    saving: "Salvando…",
    saved: "✓ Salvo!",
    error: "Erro ao salvar",
  };

  const saveBtnClass: Record<SaveStatus, string> = {
    idle: "bg-emerald-600 active:bg-emerald-700 text-white",
    saving: "bg-emerald-600/70 text-white cursor-wait",
    saved: "bg-emerald-500 text-white",
    error: "bg-rose-600 active:bg-rose-700 text-white",
  };

  // ── Performance mode: just the chord sheet, no chrome ──
  if (performanceMode) {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div
          className="w-full leading-relaxed overflow-x-auto"
          style={{ fontSize: `${fontSize}px` }}
        >
          {renderedLines.map((line) => {
            if (line.type === "empty") return <div key={line.key} className="h-3" />;
            if (line.type === "section") {
              return (
                <div key={line.key} className="text-slate-400 font-bold uppercase text-[0.7em] tracking-wider pt-3 pb-1">
                  {line.content}
                </div>
              );
            }
            if (line.type === "chords") {
              return (
                <div key={line.key} className="font-mono tracking-normal font-bold text-orange-600 dark:text-orange-400 select-all whitespace-pre-wrap leading-none pb-0.5 pt-1.5">
                  {line.content}
                </div>
              );
            }
            return (
              <div key={line.key} className="font-mono tracking-normal text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-snug pb-0.5">
                {line.content}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">

      {/* ── Sticky top control bar ── */}
      <div className="sticky top-0 z-20 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">

          {/* Left: back + title */}
          <div className="flex items-center gap-3">
            {showBackButton && onClose && (
              <button
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 active:bg-slate-100 dark:active:bg-slate-800 rounded-full transition-all active:scale-95"
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
            {song.referenceUrl && (
              <a
                href={song.referenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 min-h-[44px] px-3 py-1 text-xs font-semibold rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 active:bg-red-100 dark:active:bg-red-900/40 transition-all active:scale-95 ml-1"
                title="Abrir referência no YouTube"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
                YouTube
              </a>
            )}
          </div>

          {/* Right: controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Edit / Save / Cancel buttons */}
            {!isEditing ? (
              <button
                onClick={() => { 
                  setEditContent(song.content); 
                  setEditTitle(song.title);
                  setEditArtist(song.artist);
                  setEditPart(song.part);
                  setEditSeason(song.season || "ALL");
                  setEditReferenceUrl(song.referenceUrl || "");
                  setIsEditing(true); 
                }}
                className="flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 text-sm font-semibold border border-slate-300 dark:border-slate-600 active:bg-slate-100 dark:active:bg-slate-800 rounded-lg transition-all active:scale-95"
                title="Editar música"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="hidden sm:inline">Editar</span>
              </button>
            ) : (
              <>
                <button
                  onClick={handleCancelEdit}
                  className="min-h-[44px] px-3 py-1.5 text-sm font-semibold border border-slate-300 dark:border-slate-600 active:bg-slate-100 dark:active:bg-slate-800 rounded-lg transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saveStatus === "saving"}
                  className={`min-h-[44px] px-4 py-1.5 text-sm font-semibold rounded-lg transition-all active:scale-95 disabled:cursor-wait shadow-sm ${saveBtnClass[saveStatus]}`}
                >
                  {saveLabel[saveStatus]}
                </button>
              </>
            )}

            {/* Transpose — hidden in edit mode */}
            {!isEditing && (
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setSemitones((s) => s - 1)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-1.5 text-sm font-semibold active:bg-white dark:active:bg-slate-700 active:shadow-sm rounded-md transition-all active:scale-95"
                >
                  − Tom
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
                  onClick={() => setSemitones((s) => s + 1)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-1.5 text-sm font-semibold active:bg-white dark:active:bg-slate-700 active:shadow-sm rounded-md transition-all active:scale-95"
                >
                  + Tom
                </button>
              </div>
            )}

            {/* Font size — hidden in edit mode */}
            {!isEditing && (
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setFontSize((f) => Math.max(12, f - 2))}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center p-1.5 rounded-md active:bg-white dark:active:bg-slate-700 transition-all active:scale-95"
                  title="Diminuir fonte"
                >
                  <span className="text-xs font-bold font-sans">A−</span>
                </button>
                <span className="text-xs px-1 font-mono font-semibold">{fontSize}px</span>
                <button
                  onClick={() => setFontSize((f) => Math.min(28, f + 2))}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center p-1.5 rounded-md active:bg-white dark:active:bg-slate-700 transition-all active:scale-95"
                  title="Aumentar fonte"
                >
                  <span className="text-xs font-bold font-sans">A+</span>
                </button>
              </div>
            )}

            {/* Add to Setlist — hidden in edit mode */}
            {!isEditing && setlists.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedSetlistId}
                  onChange={(e) => setSelectedSetlistId(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-3 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">Selecione a Missa...</option>
                  {setlists.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddToSetlist}
                  disabled={!selectedSetlistId || isAdding}
                  className="min-h-[44px] bg-violet-600 active:bg-violet-700 text-white font-semibold py-1.5 px-4 rounded-lg text-xs md:text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed active:shadow-md active:scale-95"
                >
                  {isAdding ? "Adicionando..." : "Adicionar"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Feedback banner */}
        {message.text && (
          <div className="max-w-4xl mx-auto mt-2">
            <div className={`p-2 rounded-md text-xs font-semibold text-center border ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
                : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50"
            }`}>
              {message.text}
            </div>
          </div>
        )}

        {/* Edit mode hint */}
        {isEditing && (
          <div className="max-w-4xl mx-auto mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            Clique no editor abaixo e edite diretamente — acordes ficam em
            <span className="text-orange-500 font-semibold">laranja</span> em tempo real.
          </div>
        )}
      </div>

      {/* ── Main content area ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:py-10">

        {isEditing ? (
          /* ── Edit Mode ── */
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Título</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Artista/Autor</label>
                <input
                  type="text"
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Momento Litúrgico</label>
                <select
                  value={editPart}
                  onChange={(e) => setEditPart(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {Object.keys(PART_LABELS).map((p) => (
                    <option key={p} value={p}>{PART_LABELS[p as keyof typeof PART_LABELS]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Tempo Litúrgico</label>
                <select
                  value={editSeason}
                  onChange={(e) => setEditSeason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="ALL">Qualquer / Todos</option>
                  {Object.keys(SEASON_LABELS).map((s) => (
                    <option key={s} value={s}>{SEASON_LABELS[s as keyof typeof SEASON_LABELS]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 lg:col-span-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Referência (YouTube)</label>
                <input
                  type="url"
                  value={editReferenceUrl}
                  onChange={(e) => setEditReferenceUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-400"
                />
              </div>
            </div>

            <ChordEditor value={editContent} onChange={setEditContent} />
            <p className="text-[11px] text-slate-400 text-right">
              Clique em <strong>Salvar Alterações</strong> para persistir no banco de dados.
            </p>
          </div>
        ) : (
          /* ── Read-only rendered view ── */
          <div
            className="max-w-4xl w-full mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 md:p-10 shadow-sm leading-relaxed overflow-x-auto"
            style={{ fontSize: `${fontSize}px` }}
          >
            {renderedLines.map((line) => {
              if (line.type === "empty") return <div key={line.key} className="h-4" />;
              if (line.type === "header") {
                return (
                  <div key={line.key} className="font-sans font-bold text-slate-400 dark:text-slate-500 select-none border-b border-slate-100 dark:border-slate-800/80 pb-1 mt-6 mb-2 text-[0.85em] uppercase tracking-wider">
                    {line.content}
                  </div>
                );
              }
              if (line.type === "chords") {
                const introMatch = line.content.match(/^(\s*(?:intro(?:du[cç][aã]o)?)[:.\-]*\s*)(.*)$/i);
                if (introMatch) {
                  return (
                    <div key={line.key} className="font-mono tracking-normal whitespace-pre-wrap leading-none pb-1 pt-2">
                      <span className="text-slate-500 dark:text-slate-400 font-normal">{introMatch[1]}</span>
                      <span className="font-bold text-orange-600 dark:text-orange-400">{introMatch[2]}</span>
                    </div>
                  );
                }
                return (
                  <div key={line.key} className="font-mono tracking-normal font-bold text-orange-600 dark:text-orange-400 select-all whitespace-pre-wrap leading-none pb-1 pt-2">
                    {line.content}
                  </div>
                );
              }
              return (
                <div key={line.key} className="font-mono tracking-normal text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed pb-1">
                  {line.content}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
