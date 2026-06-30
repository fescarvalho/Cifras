"use client";

import { useState } from "react";
import { LiturgicalPart } from "@/generated/prisma/client";
import { saveMassFromImport } from "@/app/actions";
import { useRouter } from "next/navigation";
import { isChordLine, sanitizePdfText } from "@/utils/chordTransposer";
import { PART_LABELS } from "@/utils/labels";

interface ExtractedSong {
  id: string;
  title: string;
  content: string;
  part: LiturgicalPart;
}

const LITURGICAL_PARTS = [
  "ENTRADA", "PERDAO", "GLORIA", "SALMO", "ACLAMACAO", "OFERTORIO",
  "SANTO", "RESPOSTAS_EUCARISTICAS", "AMEM", "CORDEIRO",
  "COMUNHAO", "ACAO_DE_GRACAS", "CANTO_FINAL", "ESPECIAL",
] as const;

// ── Live Preview ──────────────────────────────────────────────────────────────
function ChordPreview({ content }: { content: string }) {
  const sanitized = sanitizePdfText(content ?? "");
  const lines = sanitized.split("\n");

  return (
    <div className="h-full overflow-y-auto rounded-lg bg-slate-950 border border-slate-700 p-3 text-xs leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={i} className="h-3" />;
        }

        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          return (
            <div key={i} className="font-sans font-bold text-slate-400 uppercase tracking-wider text-[0.7em] mt-3 mb-1 border-b border-slate-800 pb-0.5">
              {trimmed}
            </div>
          );
        }

        if (isChordLine(line)) {
          return (
            <div key={i} className="font-mono font-bold text-orange-400 whitespace-pre leading-none pt-2 pb-0.5">
              {line}
            </div>
          );
        }

        return (
          <div key={i} className="font-sans text-slate-200 whitespace-pre-wrap">
            {line}
          </div>
        );
      })}
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
  const [showPreview, setShowPreview] = useState(true);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Música {index + 1}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium"
          >
            {showPreview ? "Ocultar preview" : "Ver preview"}
          </button>
          <button
            onClick={() => onRemove(song.id)}
            className="text-xs text-rose-500 hover:text-rose-700 font-medium"
          >
            Remover
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Title + Part */}
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
        </div>

        {/* Editor + Preview side-by-side on large screens */}
        <div className={`grid gap-3 ${showPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
          {/* Textarea */}
          <div className="space-y-1 flex flex-col">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Conteúdo (Letra e Cifras)
            </label>
            <textarea
              value={song.content}
              onChange={(e) => onUpdate(song.id, "content", e.target.value)}
              rows={14}
              spellCheck={false}
              className="flex-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 whitespace-pre resize-y focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Live Preview */}
          {showPreview && (
            <div className="space-y-1 flex flex-col">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                Pré-visualização
              </label>
              <div className="flex-1">
                <ChordPreview content={song.content} />
              </div>
            </div>
          )}
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

  // Setlist details
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

      setSongs(data.songs);
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
        songs: songs.map((s) => ({ title: s.title, content: s.content, part: s.part })),
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

  // ── Upload screen ──
  if (songs.length === 0) {
    return (
      <div className="p-6 bg-white dark:bg-slate-900 rounded-xl shadow-md space-y-5 border border-slate-200 dark:border-slate-700">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Importar Repertório via PDF</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Faça o upload de um PDF com as músicas. O sistema tentará extrair os textos e dividi-los automaticamente.
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
              {file && (
                <span className="text-xs text-slate-400">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
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

  // ── Review screen ──
  return (
    <div className="space-y-6">
      {/* Mass metadata */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Revisão do Repertório
          <span className="ml-2 text-sm font-normal text-slate-400">({songs.length} música{songs.length !== 1 ? "s" : ""} encontrada{songs.length !== 1 ? "s" : ""})</span>
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
