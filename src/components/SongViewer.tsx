"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { motion, PanInfo } from "framer-motion";
import { Song, Setlist } from "@/generated/prisma/client";
import { transposeLine, getPreferredScale, isChordLine, isChordToken, sanitizePdfText, getSemitoneDifference, getTransposedKey } from "@/utils/chordTransposer";
import { calculateSmartCapo, formatCapo } from "@/utils/smartCapo";
import ChordPopover from "./ChordPopover";
import { PART_LABELS, PART_COLORS, SEASON_LABELS } from "@/utils/labels";
import { addSongToSetlist, updateSongContent } from "@/app/actions";
import { useOfflineSync } from "./OfflineSyncManager";
import { db } from "@/lib/db-local";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";

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
  onNextSong?: () => void;
  onPrevSong?: () => void;
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
      const introMatch = line.match(/^(\s*\[?(?:intro(?:du[cç][aã]o)?)\]?[:.\-]*\s*)(.*)$/i);
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
      className="font-mono whitespace-pre-wrap"
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
        className="font-mono whitespace-pre-wrap"
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
        className="font-mono whitespace-pre-wrap"
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
        className="font-mono whitespace-pre-wrap"
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
// Interactive chord line — whitespace preserved verbatim; the enlarged hit-area
// is an absolutely positioned pseudo-element (no padding/margin → alignment intact).
type ChordTap = (chord: string, el: HTMLElement) => void;

function InteractiveChords({ text, onChordTap }: { text: string; onChordTap: ChordTap }) {
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        if (!part || /^\s+$/.test(part) || !/^[A-G]/.test(part) || !isChordToken(part)) {
          return <React.Fragment key={i}>{part}</React.Fragment>;
        }
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChordTap(part, e.currentTarget);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onChordTap(part, e.currentTarget);
            }}
            className="relative cursor-pointer rounded-sm active:bg-orange-500/25 after:content-[''] after:absolute after:-inset-x-0.5 after:-inset-y-2"
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

// ─────────────────────────────────────────────────────────────────────────────
// Main SongViewer
// ─────────────────────────────────────────────────────────────────────────────
export default function SongViewer({ song, setlists = [], onClose, showBackButton = false, performanceMode = false, semitones: externalSemitones, fontSize: externalFontSize, initialKey, onChangeKey, onNextSong, onPrevSong }: SongViewerProps) {
  // Wake Lock for Repertoire view and Cipher display
  useScreenWakeLock();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [internalCurrentKey, setInternalCurrentKey] = useState<string>(initialKey || song.originalKey || "C");
  const [internalFontSize, setInternalFontSize] = useState(16);

  const currentKey = internalCurrentKey;
  const setFontSize = setInternalFontSize;
  const fontSize = externalFontSize ?? internalFontSize;
  const [selectedSetlistId, setSelectedSetlistId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  // True original key edit state
  const [isEditingOriginalKey, setIsEditingOriginalKey] = useState(false);
  const [isUpdatingOriginalKey, setIsUpdatingOriginalKey] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(song.content);
  const [editTitle, setEditTitle] = useState(song.title);
  const [editArtist, setEditArtist] = useState(song.artist);
  const [editPart, setEditPart] = useState(song.part);
  const [editSeason, setEditSeason] = useState(song.season || "ALL");
  const [editReferenceUrl, setEditReferenceUrl] = useState(song.referenceUrl || "");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [chordPopover, setChordPopover] = useState<{ chord: string; rect: DOMRect } | null>(null);
  const handleChordTap = useCallback<ChordTap>((chord, el) => {
    setChordPopover({ chord, rect: el.getBoundingClientRect() });
  }, []);
  const closeChordPopover = useCallback(() => setChordPopover(null), []);

  const preferredScale = useMemo(() => getPreferredScale(song.content), [song.content]);

  // Derive semitones from originalKey and currentKey for transposition
  const semitones = useMemo(() => {
    return getSemitoneDifference(song.originalKey || "C", currentKey);
  }, [song.originalKey, currentKey]);

  const onChangeKeyRef = useRef(onChangeKey);
  const lastFiredKey = useRef<string | null>(initialKey || null);

  useEffect(() => {
    onChangeKeyRef.current = onChangeKey;
  }, [onChangeKey]);

  // Sync with external initialKey if it changes (e.g. from Performance Mode footer or Supabase Realtime Maestro)
  useEffect(() => {
    if (initialKey) {
      lastFiredKey.current = initialKey;
      setInternalCurrentKey(initialKey);
    }
  }, [initialKey]);

  // Reset scroll to top when switching songs in Play Mode
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [song.id]);

  // 1. Suporte a Pedais Bluetooth (Page-Turners)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        const step = window.innerHeight * 0.8;
        window.scrollBy({ top: step, behavior: "smooth" });
        scrollContainerRef.current?.scrollBy({ top: step, behavior: "smooth" });
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        const step = -(window.innerHeight * 0.8);
        window.scrollBy({ top: step, behavior: "smooth" });
        scrollContainerRef.current?.scrollBy({ top: step, behavior: "smooth" });
      } else if (e.key === "ArrowRight") {
        if (onNextSong) {
          e.preventDefault();
          onNextSong();
        }
      } else if (e.key === "ArrowLeft") {
        if (onPrevSong) {
          e.preventDefault();
          onPrevSong();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, onNextSong, onPrevSong]);

  // 3. Gestos Fluídos de Navegação (Framer Motion - Swipe Left/Right)
  const handleSwipeDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const SWIPE_OFFSET_THRESHOLD = 65;
      const SWIPE_VELOCITY_THRESHOLD = 400;

      if (
        info.offset.x < -SWIPE_OFFSET_THRESHOLD ||
        info.velocity.x < -SWIPE_VELOCITY_THRESHOLD
      ) {
        onNextSong?.();
      } else if (
        info.offset.x > SWIPE_OFFSET_THRESHOLD ||
        info.velocity.x > SWIPE_VELOCITY_THRESHOLD
      ) {
        onPrevSong?.();
      }
    },
    [onNextSong, onPrevSong]
  );

  // Hook to notify parent component when currentKey changes via UI interactions, with Debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      if (onChangeKeyRef.current && currentKey && currentKey !== lastFiredKey.current) {
        lastFiredKey.current = currentKey;
        onChangeKeyRef.current(currentKey);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [currentKey]);

  const handleOriginalKeyChange = async (newKey: string) => {
    setIsUpdatingOriginalKey(true);
    try {
      if (isOnline) {
        await fetch(`/api/songs/${song.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalKey: newKey })
        });
      } else {
        await db.syncQueue.add({
          action: 'UPDATE_SONG_CONTENT',
          payload: { id: song.id, originalKey: newKey },
          createdAt: new Date()
        });
      }
      
      // Update local db
      await db.songs.update(song.id, { originalKey: newKey });
      
      // Mutate current song object
      song.originalKey = newKey;
      
      // Update the current key to match the new original key so it stays visually the same
      setInternalCurrentKey(newKey);
      
      setMessage({ text: "Tom original atualizado!", type: "success" });
      setTimeout(() => setMessage({ text: "", type: "" }), 3000);
    } catch (e: any) {
      setMessage({ text: `Erro: ${e.message}`, type: "error" });
    } finally {
      setIsUpdatingOriginalKey(false);
      setIsEditingOriginalKey(false);
    }
  };

  const handleTranspose = (direction: -1 | 1) => {
    setInternalCurrentKey((prev) => {
      const nextKey = getTransposedKey(prev, direction, preferredScale);
      if (onChangeKeyRef.current && nextKey !== lastFiredKey.current) {
        lastFiredKey.current = nextKey;
        onChangeKeyRef.current(nextKey);
      }
      return nextKey;
    });
  };

  const smartCapo = useMemo(() => calculateSmartCapo(currentKey), [currentKey]);

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
      <div ref={scrollContainerRef} className="flex-1 h-full overflow-y-auto px-3 py-2">
        {smartCapo && (
          <div className="sticky top-0 z-10 flex justify-end pointer-events-none">
            <span className="pointer-events-auto text-[11px] font-bold px-2.5 py-1 rounded-xl backdrop-blur-md bg-slate-900/70 text-amber-300 border border-white/10">
              {formatCapo(smartCapo)}
            </span>
          </div>
        )}
        {chordPopover && (
          <ChordPopover chord={chordPopover.chord} anchor={chordPopover.rect} onClose={closeChordPopover} />
        )}
        <motion.div
          key={song.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={handleSwipeDragEnd}
          className="w-full font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto"
          style={{ fontSize: `${fontSize}px`, touchAction: "pan-y" }}
        >
          {renderedLines.map((line) => {
            if (line.type === "empty") return <div key={line.key} className="h-3" />;
            if (line.type === "header") {
              return (
                <div key={line.key} className="font-mono whitespace-pre-wrap text-slate-400 font-bold uppercase text-[0.7em] tracking-wider pt-3 pb-1">
                  {line.content}
                </div>
              );
            }
            if (line.type === "chords") {
              return (
                <div key={line.key} className="font-mono tracking-normal font-bold text-orange-600 dark:text-orange-400 whitespace-pre-wrap leading-none pb-0.5 pt-1.5">
                  <InteractiveChords text={line.content} onChordTap={handleChordTap} />
                </div>
              );
            }
            return (
              <div key={line.key} className="font-mono tracking-normal text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-snug pb-0.5">
                {line.content}
              </div>
            );
          })}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {chordPopover && (
        <ChordPopover chord={chordPopover.chord} anchor={chordPopover.rect} onClose={closeChordPopover} />
      )}

      {/* ── Sticky top control bar ── */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/85 dark:bg-slate-900/85 border-b border-slate-200/80 dark:border-slate-800/80 px-3 py-2.5 md:px-6 md:py-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="max-w-4xl mx-auto flex flex-col gap-2.5">

          {/* Top Row: Back + Title/Artist + Quick Actions (YouTube / Edit) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {showBackButton && onClose && (
                <button
                  onClick={onClose}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 bg-slate-100/80 dark:bg-slate-800/80 active:bg-slate-200 dark:active:bg-slate-700 rounded-xl transition-all active:scale-95 shrink-0 text-slate-700 dark:text-slate-200"
                  title="Voltar"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg md:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                    {song.title}
                  </h1>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${PART_COLORS[song.part]}`}>
                    {PART_LABELS[song.part]}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{song.artist}</p>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  {/* Original Key Editor Badge */}
                  {isEditingOriginalKey ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={song.originalKey || "C"}
                        onChange={(e) => handleOriginalKeyChange(e.target.value)}
                        disabled={isUpdatingOriginalKey}
                        className="bg-white dark:bg-slate-800 border border-violet-300 dark:border-violet-700 rounded-md py-0.5 px-1.5 text-[11px] font-mono font-bold focus:outline-none"
                      >
                        <option disabled value="">Tom real</option>
                        {['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'].map(k => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setIsEditingOriginalKey(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => !isEditing && setIsEditingOriginalKey(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                      title="Corrigir Tom Original"
                    >
                      <span>Orig: <strong className="font-mono text-slate-700 dark:text-slate-300">{song.originalKey}</strong></span>
                      {!isEditing && (
                        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right: YouTube + Edit/Save */}
            <div className="flex items-center gap-1.5 shrink-0">
              {song.referenceUrl && !isEditing && (
                <a
                  href={song.referenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 min-h-[38px] px-2.5 py-1.5 text-xs font-bold rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/60 active:scale-95 transition-all"
                  title="Abrir referência no YouTube"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
                  <span className="hidden sm:inline">YouTube</span>
                </a>
              )}

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
                  className="flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-bold border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-700 rounded-xl transition-all active:scale-95 shadow-sm"
                  title="Editar música"
                >
                  <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="hidden sm:inline">Editar</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCancelEdit}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saveStatus === "saving"}
                    className={`min-h-[38px] px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all active:scale-95 disabled:cursor-wait shadow-sm ${saveBtnClass[saveStatus]}`}
                  >
                    {saveLabel[saveStatus]}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Second Row: Transpose + Font Size + Add to Setlist (hidden in edit mode) */}
          {!isEditing && (
            <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pt-0.5">
              <div className="flex items-center gap-2 shrink-0">
                {/* Transpose Pill */}
                <div className="flex items-center bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-0.5">
                  <button
                    onClick={() => handleTranspose(-1)}
                    className="min-h-[34px] min-w-[36px] flex items-center justify-center px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 active:bg-white dark:active:bg-slate-700 rounded-lg transition-all active:scale-95"
                    title="Transpor -1 Semitom"
                  >
                    −1
                  </button>
                  <div className="px-2.5 py-0.5 text-xs font-mono font-extrabold text-center min-w-[52px] flex items-center justify-center gap-1 text-violet-700 dark:text-violet-300">
                    <span>{currentKey}</span>
                    {semitones !== 0 && (
                      <span className="text-[10px] font-bold text-orange-500">
                        ({semitones > 0 ? `+${semitones}` : semitones})
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleTranspose(1)}
                    className="min-h-[34px] min-w-[36px] flex items-center justify-center px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 active:bg-white dark:active:bg-slate-700 rounded-lg transition-all active:scale-95"
                    title="Transpor +1 Semitom"
                  >
                    +1
                  </button>
                </div>

                {/* Smart Capo badge */}
                {smartCapo && (
                  <span
                    className="shrink-0 whitespace-nowrap text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/50"
                    title="Capotraste sugerido para usar shapes abertos (C, A, G, E, D)"
                  >
                    {formatCapo(smartCapo)}
                  </span>
                )}

                {/* Font size Pill */}
                <div className="flex items-center bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60 rounded-xl p-0.5">
                  <button
                    onClick={() => setFontSize((f) => Math.max(8, f - 2))}
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 active:bg-white dark:active:bg-slate-700 transition-all active:scale-95"
                    title="Diminuir fonte"
                  >
                    <span className="text-xs font-bold">A−</span>
                  </button>
                  <span className="text-[11px] px-1.5 font-mono font-bold text-slate-500 dark:text-slate-400">{fontSize}</span>
                  <button
                    onClick={() => setFontSize((f) => Math.min(28, f + 2))}
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-700 dark:text-slate-200 active:bg-white dark:active:bg-slate-700 transition-all active:scale-95"
                    title="Aumentar fonte"
                  >
                    <span className="text-xs font-bold">A+</span>
                  </button>
                </div>
              </div>

              {/* Add to Setlist */}
              {setlists.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    value={selectedSetlistId}
                    onChange={(e) => setSelectedSetlistId(e.target.value)}
                    className="bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl py-1.5 px-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-500/50 max-w-[140px] sm:max-w-[180px]"
                  >
                    <option value="">+ Missa...</option>
                    {setlists.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddToSetlist}
                    disabled={!selectedSetlistId || isAdding}
                    className="min-h-[34px] bg-violet-600 active:bg-violet-700 text-white font-bold py-1.5 px-3 rounded-xl text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm"
                  >
                    {isAdding ? "..." : "Incluir"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feedback banner */}
        {message.text && (
          <div className="max-w-4xl mx-auto mt-2">
            <div className={`p-2 rounded-xl text-xs font-semibold text-center border ${
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
            Toque no editor abaixo para editar — acordes ficam em
            <span className="text-orange-500 font-semibold">laranja</span> automaticamente.
          </div>
        )}
      </div>

      {/* ── Main content area ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-6 md:py-10">

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
          <motion.div
            key={song.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            drag={onNextSong || onPrevSong ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={handleSwipeDragEnd}
            className="max-w-4xl w-full mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 md:p-10 shadow-sm font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto"
            style={{ fontSize: `${fontSize}px`, touchAction: "pan-y" }}
          >
            {renderedLines.map((line) => {
              if (line.type === "empty") return <div key={line.key} className="h-4" />;
              if (line.type === "header") {
                return (
                  <div key={line.key} className="font-mono whitespace-pre-wrap font-bold text-slate-400 dark:text-slate-500 select-none border-b border-slate-100 dark:border-slate-800/80 pb-1 mt-6 mb-2 text-[0.85em] uppercase tracking-wider">
                    {line.content}
                  </div>
                );
              }
              if (line.type === "chords") {
                const introMatch = line.content.match(/^(\s*\[?(?:intro(?:du[cç][aã]o)?)\]?[:.\-]*\s*)(.*)$/i);
                if (introMatch) {
                  return (
                    <div key={line.key} className="font-mono tracking-normal whitespace-pre-wrap leading-none pb-1 pt-2">
                      <span className="text-slate-500 dark:text-slate-400 font-normal">{introMatch[1]}</span>
                      <span className="font-bold text-orange-600 dark:text-orange-400">
                        <InteractiveChords text={introMatch[2]} onChordTap={handleChordTap} />
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={line.key} className="font-mono tracking-normal font-bold text-orange-600 dark:text-orange-400 whitespace-pre-wrap leading-none pb-1 pt-2">
                    <InteractiveChords text={line.content} onChordTap={handleChordTap} />
                  </div>
                );
              }
              return (
                <div key={line.key} className="font-mono tracking-normal text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed pb-1">
                  {line.content}
                </div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
