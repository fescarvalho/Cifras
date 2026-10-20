"use client";

import React, { useState } from "react";
import { LiturgicalPart, LiturgicalSeason } from "@/generated/prisma/client";
import { PART_LABELS, SEASON_LABELS } from "@/utils/labels";
import { createSong } from "@/app/actions";
import { useOfflineSync } from "./OfflineSyncManager";
import { db } from "@/lib/db-local";

interface CreateSongModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateSongModal({ onClose, onSuccess }: CreateSongModalProps) {
  const { isOnline } = useOfflineSync();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [originalKey, setOriginalKey] = useState("C");
  const [part, setPart] = useState<LiturgicalPart>("ENTRADA");
  const [season, setSeason] = useState<LiturgicalSeason | "">("");
  const [content, setContent] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsingPrint, setIsParsingPrint] = useState(false);
  const [printSuccessMessage, setPrintSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleProcessPrintFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Por favor, selecione uma imagem válida (PNG, JPG ou WEBP).");
      return;
    }
    setError("");
    setPrintSuccessMessage("");
    setIsParsingPrint(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-print", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao processar imagem.");
      }

      if (data.songs && data.songs.length > 0) {
        const first = data.songs[0];
        if (first.title) setTitle(first.title);
        if (first.artist && first.artist !== "Desconhecido") setArtist(first.artist);
        if (first.key) setOriginalKey(first.key);
        if (first.part) setPart(first.part);
        if (first.referenceUrl) setReferenceUrl(first.referenceUrl);
        if (first.content) setContent(first.content);

        setPrintSuccessMessage(
          `Cifra extraída do print com sucesso! (${first.title || "Música identificada"})`
        );
      } else {
        throw new Error("Nenhuma música identificada na imagem.");
      }
    } catch (err: any) {
      setError(err.message || "Falha ao analisar o print.");
    } finally {
      setIsParsingPrint(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleProcessPrintFile(e.target.files[0]);
    }
  };

  // Allow pasting screenshot with Ctrl+V directly into modal
  React.useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            handleProcessPrintFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setError("Sem conexão para salvar.");
      return;
    }
    if (!title || !artist || !content) {
      setError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      const res = await createSong({
        title,
        artist,
        originalKey,
        part,
        season: season || null,
        content,
      });

      if (res.success && res.song) {
        // Update local DB so it shows up instantly on the screen
        await db.songs.put({
          id: res.song.id,
          title: res.song.title,
          artist: res.song.artist,
          originalKey: res.song.originalKey,
          content: res.song.content,
          part: res.song.part,
          season: res.song.season,
          referenceUrl: referenceUrl || res.song.referenceUrl || null,
          createdAt: new Date(res.song.createdAt),
          updatedAt: new Date(res.song.updatedAt),
          isSynced: true
        });
        onSuccess();
        onClose();
      } else {
        setError(`Erro: ${res.error}`);
      }
    } catch (e: any) {
      setError(`Erro ao conectar: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <h2 className="text-lg md:text-xl font-bold text-slate-950 dark:text-slate-50">Nova Cifra Litúrgica</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
          {/* Quick Print Import Box */}
          <div className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/40 dark:to-indigo-950/30 border border-violet-200/80 dark:border-violet-800/50 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="p-2.5 bg-violet-600 text-white rounded-xl shadow-xs shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="text-xs md:text-sm font-bold text-violet-950 dark:text-violet-100 flex items-center gap-1.5">
                  Importar via Print / Foto
                  <span className="text-[10px] bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    IA
                  </span>
                </div>
                <div className="text-[11px] text-violet-700 dark:text-violet-300">
                  Selecione um print ou pressione <kbd className="px-1 py-0.5 bg-white/70 dark:bg-slate-800 rounded text-[10px] font-mono border border-violet-200 dark:border-violet-700">Ctrl + V</kbd>
                </div>
              </div>
            </div>

            <div className="w-full sm:w-auto flex items-center justify-end shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsingPrint}
                className="w-full sm:w-auto px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                {isParsingPrint ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Lendo Print...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Carregar Imagem</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {printSuccessMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{printSuccessMessage}</span>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-400 p-3 rounded-xl text-xs font-semibold text-center">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                Título *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Como és Lindo"
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 transition-all"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                Artista / Ministério *
              </label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Ex: Vida Reluz"
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 transition-all"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                Tom Original *
              </label>
              <input
                type="text"
                value={originalKey}
                onChange={(e) => setOriginalKey(e.target.value)}
                placeholder="Ex: C#m, G/B, F"
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 transition-all"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                Momento da Missa *
              </label>
              <select
                value={part}
                onChange={(e) => setPart(e.target.value as LiturgicalPart)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 transition-all cursor-pointer"
                required
              >
                {Object.entries(PART_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                Tempo Litúrgico
              </label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 transition-all cursor-pointer"
              >
                <option value="">Geral / Nenhum</option>
                {Object.entries(SEASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-h-[250px]">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1 flex justify-between">
              <span>Cifra (Letras e Acordes) *</span>
              <span className="text-[10px] text-slate-400 font-normal">Use fonte monospaçada para alinhar acordes</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`[Intro]
C  G/B  Am  F

[Estrofe 1]
C            G/B
Senhor, meu Deus...`}
              className="flex-1 w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 placeholder-slate-450 resize-none min-h-[200px]"
              required
            />
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-semibold py-2.5 px-5 rounded-xl text-sm transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-6 rounded-xl text-sm transition-all shadow-md active:scale-95"
            >
              {isSubmitting ? "Cadastrando..." : "Cadastrar Música"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
