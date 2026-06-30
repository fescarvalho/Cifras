"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import { Song, Setlist } from "@/generated/prisma/client";
import { transposeLine, getPreferredScale, isChordLine, sanitizePdfText } from "@/utils/chordTransposer";
import { PART_LABELS, PART_COLORS, SEASON_LABELS } from "@/utils/labels";
import { addSongToSetlist, updateSongContent } from "@/app/actions";

interface SongViewerProps {
  song: Song;
  setlists?: Setlist[];
  onClose?: () => void;
  showBackButton?: boolean;
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
export default function SongViewer({ song, setlists = [], onClose, showBackButton = false }: SongViewerProps) {
  const [semitones, setSemitones] = useState(0);
  const [fontSize, setFontSize] = useState(16);
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const preferredScale = useMemo(() => getPreferredScale(song.content), [song.content]);

  const currentKey = useMemo(() => {
    if (semitones === 0) return song.originalKey;
    const match = song.originalKey.match(/^([A-G](?:#|b)?)(.*)$/);
    if (!match) return song.originalKey;
    const [, root, extension] = match;
    const NOTE_TO_SEMITONE: Record<string, number> = {
      C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
      "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
    };
    const current = NOTE_TO_SEMITONE[root];
    if (current === undefined) return song.originalKey;
    let newSt = (current + semitones) % 12;
    if (newSt < 0) newSt += 12;
    return preferredScale[newSt] + extension;
  }, [song.originalKey, semitones, preferredScale]);

  const renderedLines = useMemo(() => {
    const sanitized = sanitizePdfText(song.content ?? "");
    return sanitized.split("\n").map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return { type: "empty", content: "", key: idx };
      if (trimmed.startsWith("[") && trimmed.endsWith("]"))
        return { type: "header", content: trimmed, key: idx };
      if (isChordLine(line)) {
        return { type: "chords", content: transposeLine(line, semitones, preferredScale), key: idx };
      }
      return { type: "lyrics", content: line, key: idx };
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

  const handleSaveEdit = async () => {
    setSaveStatus("saving");
    try {
      const dataToUpdate = {
        content: editContent,
        title: editTitle,
        artist: editArtist,
        part: editPart,
        season: editSeason === "ALL" ? null : editSeason,
      };
      
      const res = await updateSongContent(song.id, dataToUpdate);
      if (res.success) {
        setSaveStatus("saved");
        // Patch the local song object so renderedLines and UI re-computes with new content
        song.content = editContent;
        song.title = editTitle;
        song.artist = editArtist;
        song.part = editPart;
        song.season = (editSeason === "ALL" ? null : editSeason) as any;
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
    idle: "bg-emerald-600 hover:bg-emerald-700 text-white",
    saving: "bg-emerald-600/70 text-white cursor-wait",
    saved: "bg-emerald-500 text-white",
    error: "bg-rose-600 hover:bg-rose-700 text-white",
  };

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
                  setIsEditing(true); 
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all active:scale-95"
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
                  className="px-3 py-1.5 text-sm font-semibold border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saveStatus === "saving"}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all active:scale-95 disabled:cursor-wait shadow-sm ${saveBtnClass[saveStatus]}`}
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
                  className="px-3 py-1.5 text-sm font-semibold hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-md transition-all active:scale-95"
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
                  className="px-3 py-1.5 text-sm font-semibold hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-md transition-all active:scale-95"
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
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-700"
                  title="Diminuir fonte"
                >
                  <span className="text-xs font-bold font-sans">A−</span>
                </button>
                <span className="text-xs px-1 font-mono font-semibold">{fontSize}px</span>
                <button
                  onClick={() => setFontSize((f) => Math.min(28, f + 2))}
                  className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-700"
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
                  className="bg-violet-600 hover:bg-violet-700 text-white font-semibold py-1.5 px-4 rounded-lg text-xs md:text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md active:scale-95"
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
                return (
                  <div key={line.key} className="font-mono font-bold text-orange-600 dark:text-orange-400 select-all whitespace-pre leading-none pb-1 pt-2" style={{ letterSpacing: "normal" }}>
                    {line.content}
                  </div>
                );
              }
              return (
                <div key={line.key} className="font-sans text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed pb-1">
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
