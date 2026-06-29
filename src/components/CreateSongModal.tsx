"use client";

import React, { useState } from "react";
import { LiturgicalPart, LiturgicalSeason } from "@/generated/prisma/client";
import { PART_LABELS, SEASON_LABELS } from "@/utils/labels";
import { createSong } from "@/app/actions";

interface CreateSongModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateSongModal({ onClose, onSuccess }: CreateSongModalProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [originalKey, setOriginalKey] = useState("C");
  const [part, setPart] = useState<LiturgicalPart>("ENTRADA");
  const [season, setSeason] = useState<LiturgicalSeason | "">("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      if (res.success) {
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
