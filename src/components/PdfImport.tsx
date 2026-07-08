"use client";

import { useRef, useCallback, useState } from "react";
import { LiturgicalPart } from "@/generated/prisma/client";
import { saveMassFromImport } from "@/app/actions";
import { useRouter } from "next/navigation";
import { isChordLine, sanitizePdfText, autoDetectKey } from "@/utils/chordTransposer";
import { PART_LABELS } from "@/utils/labels";

interface ExtractedSong {
  id: string;
  title: string;
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
        {/* Title + Part row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songs, setSongs] = useState<ExtractedSong[]>([]);

  const [massTitle, setMassTitle] = useState("");
  const [massDate, setMassDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/parse-pdf", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Erro ao processar o PDF.");

      // Sanitize content before showing to the editor
      setSongs(data.songs.map((s: ExtractedSong) => {
        const sanitizedContent = sanitizePdfText(s.content);
        return {
          ...s,
          content: sanitizedContent,
          key: autoDetectKey(sanitizedContent),
        };
      }));
      if (!massTitle) setMassTitle(file.name.replace(/\.pdf$/i, ""));
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
        songs: songs.map((s) => ({ title: s.title, content: s.content, part: s.part, referenceUrl: s.referenceUrl || null, key: s.key || "C" })),
      });

      if (!res.success) throw new Error(res.error);

      alert("Missa importada e salva com sucesso!");
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
      <div className="p-6 bg-white dark:bg-slate-900 rounded-xl shadow-md space-y-5 border border-slate-200 dark:border-slate-700">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Importar Repertório via PDF</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Faça o upload de um PDF com as músicas. O sistema extrairá os textos e dividirá por página automaticamente.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl cursor-pointer bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
            <div className="flex flex-col items-center gap-1">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-3-3v6m-9 3h18a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {file ? file.name : "Clique para selecionar o PDF"}
              </span>
              {file && <span className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</span>}
            </div>
            <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
          </label>

          {error && (
            <div className="flex items-center gap-2 text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full sm:w-auto px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Processando…
              </span>
            ) : "Extrair Músicas"}
          </button>
        </div>
      </div>
    );
  }

  // ── Review screen ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Mass metadata */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Revisão do Repertório
          <span className="ml-2 text-sm font-normal text-slate-400">
            ({songs.length} música{songs.length !== 1 ? "s" : ""} encontrada{songs.length !== 1 ? "s" : ""})
          </span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Título da Missa</label>
            <input
              type="text"
              value={massTitle}
              onChange={(e) => setMassTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="Ex: Missa de Domingo"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Data</label>
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
        <div className="flex items-center gap-2 text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
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
      <div className="flex justify-end gap-3 pb-10">
        <button
          onClick={() => setSongs([])}
          className="px-5 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSaveMass}
          disabled={isSaving || songs.length === 0}
          className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {isSaving ? "Salvando…" : "Salvar Missa Completa"}
        </button>
      </div>
    </div>
  );
}
