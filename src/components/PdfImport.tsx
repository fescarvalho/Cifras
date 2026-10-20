"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { LiturgicalPart } from "@/generated/prisma/client";
import { saveMassFromImport, saveSongsOnlyFromImport } from "@/app/actions";
import { useRouter, useSearchParams } from "next/navigation";
import { isChordLine, sanitizePdfText, autoDetectKey } from "@/utils/chordTransposer";
import { PART_LABELS } from "@/utils/labels";
import { db } from "@/lib/db-local";

interface ExtractedSong {
  id: string;
  title: string;
  artist?: string;
  content: string;
  part: LiturgicalPart;
  referenceUrl: string;
  key: string;
}
const LITURGICAL_PARTS = [
  "ENTRADA", "PERDAO", "GLORIA", "SALMO", "ACLAMACAO", "OFERTORIO",
  "SANTO", "RESPOSTAS_EUCARISTICAS", "AMEM", "CORDEIRO",
  "COMUNHAO", "ACAO_DE_GRACAS", "CANTO_FINAL", "ESPECIAL",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// WYSIWYG Chord Editor
//
// Architecture: "Overlay" technique
//   ┌─ container (position: relative, overflow: hidden) ───────────────────┐
//   │  ┌─ <pre> (highlight layer, position: absolute, pointer-events:none)─┤
//   │  │  renders coloured spans per line                                  │
//   │  └───────────────────────────────────────────────────────────────────┤
//   │  ┌─ <textarea> (input layer, position: absolute, color: transparent)─┤
//   │  │  captures keyboard/mouse; caret is visible via caret-color        │
//   │  └───────────────────────────────────────────────────────────────────┘
//
// CRITICAL: <pre> and <textarea> share IDENTICAL layout CSS so every
// character sits on the same pixel, keeping the caret perfectly aligned.
// ─────────────────────────────────────────────────────────────────────────────

// Shared style object applied to BOTH layers via inline style.
// Must be identical in every dimension — even 1px difference breaks alignment.
const SHARED_STYLE: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: "13px",
  lineHeight: "1.6",
  padding: "12px",
  margin: 0,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  wordBreak: "break-all",
  tabSize: 2,
  letterSpacing: 0,
};

function buildHighlightedHTML(text: string): React.ReactNode {
  // Ensure content always ends with a newline so the <pre> height matches textarea
  const lines = (text.endsWith("\n") ? text : text + "\n").split("\n");

  return lines.map((line, i) => {
    const isLast = i === lines.length - 1;
    const trimmed = line.trim();

    // Empty line — render a non-breaking space so the line keeps its height
    if (!trimmed) {
      return (
        <span key={i} style={{ display: "block", minHeight: "1.6em" }}>
          {isLast ? null : "\u00A0"}
        </span>
      );
    }

    // Section header [Refrão], [Verso], etc.
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return (
        <span
          key={i}
          style={{
            display: "block",
            color: "#94a3b8",   // slate-400
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontSize: "0.8em",
          }}
        >
          {line + "\n"}
        </span>
      );
    }

    // Chord line → orange
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
        <span
          key={i}
          style={{
            display: "block",
            color: "#f97316",   // orange-500
            fontWeight: 700,
          }}
        >
          {line + "\n"}
        </span>
      );
    }

    // Regular lyric line
    return (
      <span key={i} style={{ display: "block", color: "#e2e8f0" /* slate-200 */ }}>
        {line + "\n"}
      </span>
    );
  });
}

interface ChordEditorProps {
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
}

function ChordEditor({ value, onChange, minRows = 16 }: ChordEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Sync scroll: when the textarea scrolls, mirror it to the <pre>
  const handleScroll = useCallback(() => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Minimum height based on minRows
  const minHeight = `calc(${minRows} * 1.6em + 24px)`; // rows × lineHeight + 2×padding

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "8px",
        border: "1.5px solid #475569",  // slate-600
        overflow: "hidden",
        minHeight,
        background: "#0f172a",          // slate-950
        // Focus ring handled via :focus-within below (can't do in inline style)
      }}
      className="chord-editor-container"
    >
      {/* ── Highlight layer (sits behind textarea) ── */}
      <pre
        ref={preRef}
        aria-hidden="true"
        style={{
          ...SHARED_STYLE,
          position: "absolute",
          inset: 0,
          overflow: "hidden",       // hides scrollbars; textarea drives scrolling
          pointerEvents: "none",
          userSelect: "none",
          color: "#e2e8f0",         // fallback colour (individual spans override)
          background: "transparent",
          minHeight,
        }}
      >
        {buildHighlightedHTML(value)}
      </pre>

      {/* ── Input layer (invisible text, visible caret) ── */}
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
          ...SHARED_STYLE,
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          minHeight,
          background: "transparent",
          color: "transparent",       // text is invisible (shown by <pre>)
          caretColor: "#f8fafc",      // slate-50 — caret stays visible
          border: "none",
          outline: "none",
          resize: "none",
          overflow: "auto",
          zIndex: 1,
        }}
      />

      {/* Stretch the container to match content height */}
      <div
        aria-hidden="true"
        style={{
          ...SHARED_STYLE,
          visibility: "hidden",
          pointerEvents: "none",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          wordBreak: "break-all",
          minHeight,
        }}
      >
        {/* Ghost element so the container grows with content */}
        {value.endsWith("\n") ? value + " " : value + "\n "}
      </div>
    </div>
  );
}

// ── Song Card ─────────────────────────────────────────────────────────────────
function SongCard({
  song,
  index,
  onUpdate,
  onRemove,
}: {
  song: ExtractedSong;
  index: number;
  onUpdate: (id: string, field: keyof ExtractedSong, value: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Música {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
            <span className="text-orange-400 font-semibold">acordes</span>
            <span className="mx-0.5">·</span>
            <span className="text-slate-300">letras</span>
          </span>
          <button
            onClick={() => onRemove(song.id)}
            className="text-xs text-rose-500 hover:text-rose-700 font-medium ml-2"
          >
            Remover
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Title + Artist + Part + Key row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Título</label>
            <input
              type="text"
              value={song.title}
              onChange={(e) => onUpdate(song.id, "title", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Artista / Ministério</label>
            <input
              type="text"
              value={song.artist || ""}
              onChange={(e) => onUpdate(song.id, "artist", e.target.value)}
              placeholder="Ex: Vida Reluz"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Momento Litúrgico</label>
            <select
              value={song.part}
              onChange={(e) => onUpdate(song.id, "part", e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {LITURGICAL_PARTS.map((p) => (
                <option key={p} value={p}>
                  {(PART_LABELS as Record<string, string>)[p] ?? p.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Tom (Key)</label>
            <input
              type="text"
              value={song.key}
              onChange={(e) => onUpdate(song.id, "key", e.target.value)}
              placeholder="Ex: C, F#m"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* Reference URL */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
            Referência (YouTube)
          </label>
          <input
            type="url"
            value={song.referenceUrl}
            onChange={(e) => onUpdate(song.id, "referenceUrl", e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder:text-slate-400"
          />
        </div>

        {/* WYSIWYG Chord Editor */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Conteúdo — clique e edite diretamente
          </label>
          <ChordEditor
            value={song.content}
            onChange={(v) => onUpdate(song.id, "content", v)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PdfImport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams?.get("type");

  const [files, setFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songs, setSongs] = useState<ExtractedSong[]>([]);
  const [mergePages, setMergePages] = useState(false);

  const [massTitle, setMassTitle] = useState("");
  const [massDate, setMassDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isImageType = files.length > 0 && files.some((f) => f.type.startsWith("image/"));
  const isPdfType = files.length > 0 && files.some((f) => f.type === "application/pdf");

  // Cleanup object URLs when previews change or unmount
  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  // Handle files assignment and generate previews
  const applySelectedFiles = (newFiles: File[]) => {
    if (newFiles.length === 0) return;

    setError(null);
    setFiles(newFiles);

    // If images, create preview URLs
    const imageFiles = newFiles.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length > 0) {
      const urls = imageFiles.map((f) => URL.createObjectURL(f));
      setImagePreviews(urls);
    } else {
      setImagePreviews([]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      applySelectedFiles(Array.from(e.target.files));
    }
  };

  // Support paste from clipboard (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (songs.length > 0) return; // Don't intercept paste when in review mode
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const f = items[i].getAsFile();
          if (f) pastedFiles.push(f);
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        applySelectedFiles(pastedFiles);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [songs.length]);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      applySelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    // Also append the first file as 'file' for single-file backwards compatibility
    formData.append("file", files[0]);
    formData.append("mergePages", mergePages.toString());

    const isImage = files.some((f) => f.type.startsWith("image/"));
    const endpoint = isImage ? "/api/parse-print" : "/api/parse-pdf";

    try {
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || (isImage ? "Erro ao processar imagem." : "Erro ao processar o PDF."));
      }

      if (!data.songs || data.songs.length === 0) {
        throw new Error("Nenhuma cifra foi identificada.");
      }

      // Sanitize and detect keys
      setSongs(
        data.songs.map((s: ExtractedSong) => {
          const sanitizedContent = sanitizePdfText(s.content);
          return {
            ...s,
            artist: s.artist || "Desconhecido",
            content: sanitizedContent,
            key: s.key || autoDetectKey(sanitizedContent) || "C",
          };
        })
      );

      const baseName = files[0].name.replace(/\.(pdf|png|jpe?g|webp)$/i, "");
      if (!massTitle) setMassTitle(baseName);
      if (!massDate) setMassDate(new Date().toISOString().split("T")[0]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const updateSong = (id: string, field: keyof ExtractedSong, value: string) => {
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const removeSong = (id: string) => {
    setSongs((prev) => prev.filter((s) => s.id !== id));
  };

  // Option A: Save as Mass (Setlist)
  const handleSaveMass = async () => {
    if (!massTitle || !massDate || songs.length === 0) {
      setError("Preencha o título da missa, data e garanta que há músicas.");
      return;
    }
    setIsSaving(true);
    setError(null);

    try {
      const res = await saveMassFromImport({
        title: massTitle,
        dateStr: massDate,
        songs: songs.map((s) => ({
          title: s.title,
          content: s.content,
          part: s.part,
          referenceUrl: s.referenceUrl || null,
          key: s.key || "C",
        })),
      });

      if (!res.success) throw new Error(res.error);

      alert("Missa importada e salva com sucesso!");
      router.push("/repertorios");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Option B: Save directly to Song Library
  const handleSaveSongsOnly = async () => {
    if (songs.length === 0) return;
    setIsSaving(true);
    setError(null);

    try {
      const res = await saveSongsOnlyFromImport(
        songs.map((s) => ({
          title: s.title,
          artist: s.artist || "Desconhecido",
          content: s.content,
          part: s.part,
          referenceUrl: s.referenceUrl || null,
          key: s.key || "C",
        }))
      );

      if (!res.success) throw new Error(res.error);

      // Sync into Dexie for instant local UI freshness
      if (res.songs) {
        for (const s of res.songs) {
          await db.songs.put({
            id: s.id,
            title: s.title,
            artist: s.artist,
            originalKey: s.originalKey,
            content: s.content,
            part: s.part,
            season: s.season,
            referenceUrl: s.referenceUrl,
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
            isSynced: true,
          });
        }
      }

      alert(`${songs.length} música(s) salva(s) diretamente na sua biblioteca!`);
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (songs.length === 0) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-md space-y-6 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Importar Cifras
              <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-semibold px-2 py-0.5 rounded-full">
                PDF & Print com IA
              </span>
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Envie um PDF ou um Print / Foto de cifra. O sistema extrai automaticamente o tom, letra e acordes alinhados.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center w-full min-h-[170px] p-6 border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
              isDragging
                ? "border-violet-500 bg-violet-50/60 dark:bg-violet-950/30 scale-[1.01]"
                : "border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800/80"
            }`}
          >
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              multiple
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="flex flex-col items-center text-center gap-2 pointer-events-none">
              <div className="p-3 bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 rounded-full">
                {isImageType ? (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                ) : isPdfType ? (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-3-3v6m-9 3h18a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                )}
              </div>

              {files.length === 0 ? (
                <>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Clique para selecionar ou arraste um PDF ou Print
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Dica: Você também pode copiar uma imagem e colar aqui direto com{" "}
                    <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 font-mono text-[11px] text-slate-700 dark:text-slate-200">
                      Ctrl + V
                    </kbd>
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center">
                  <span className="text-sm font-bold text-violet-700 dark:text-violet-300">
                    {files.length === 1 ? files[0].name : `${files.length} arquivos selecionados`}
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5">
                    Total: {(files.reduce((acc, f) => acc + f.size, 0) / 1024).toFixed(1)} KB · Clique para trocar
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Previews for Images */}
          {imagePreviews.length > 0 && (
            <div className="flex flex-wrap gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
              {imagePreviews.map((src, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 w-24 h-24 bg-slate-200 dark:bg-slate-900 shadow-xs">
                  <img src={src} alt={`Preview ${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded font-medium">
                    #{i + 1}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Merge option */}
          <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={mergePages}
              onChange={(e) => setMergePages(e.target.checked)}
              className="w-4 h-4 text-violet-600 border-slate-300 rounded focus:ring-violet-500"
            />
            {isImageType
              ? "Juntar as imagens em uma única música contínua"
              : "O documento inteiro é uma única música (juntar as páginas)"}
          </label>

          {error && (
            <div className="flex items-center gap-2 text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl px-3.5 py-2.5 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading}
            className="w-full sm:w-auto px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>{isImageType ? "Lendo Print com IA..." : "Extraindo Músicas do PDF..."}</span>
              </>
            ) : (
              <span>Extrair Músicas</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Review screen ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Mass metadata / Header */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            Revisão das Cifras
            <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-semibold px-2.5 py-0.5 rounded-full">
              {songs.length} música{songs.length !== 1 ? "s" : ""}
            </span>
          </h2>
          <span className="text-xs text-slate-400">
            Você pode salvar como um Repertório (Missa) ou salvar diretamente na sua biblioteca.
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Título do Repertório / Missa (Opcional)</label>
            <input
              type="text"
              value={massTitle}
              onChange={(e) => setMassTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Ex: Missa do Domingo"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Data da Celebração</label>
            <input
              type="date"
              value={massDate}
              onChange={(e) => setMassDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl px-3.5 py-2.5 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Song cards */}
      <div className="space-y-5">
        {songs.map((song, index) => (
          <SongCard
            key={song.id}
            song={song}
            index={index}
            onUpdate={updateSong}
            onRemove={removeSong}
          />
        ))}
      </div>

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm sticky bottom-4 z-20">
        <button
          onClick={() => {
            setSongs([]);
            setFiles([]);
            setImagePreviews([]);
          }}
          className="w-full sm:w-auto px-4 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Descartar e Voltar
        </button>

        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={handleSaveSongsOnly}
            disabled={isSaving || songs.length === 0}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all cursor-pointer"
          >
            {isSaving ? "Salvando…" : "Salvar Apenas Músicas na Biblioteca"}
          </button>

          <button
            onClick={handleSaveMass}
            disabled={isSaving || songs.length === 0}
            className="w-full sm:w-auto px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 cursor-pointer"
          >
            {isSaving ? "Salvando…" : "Salvar como Repertório (Missa)"}
          </button>
        </div>
      </div>
    </div>
  );
}
