"use client";

import React, { useState } from "react";
import { createSetlist } from "@/app/actions";
import { useOfflineSync } from "./OfflineSyncManager";
import { db } from "@/lib/db-local";

interface CreateSetlistModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateSetlistModal({ onClose, onSuccess }: CreateSetlistModalProps) {
  const { isOnline } = useOfflineSync();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => {
    // Default to today
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) {
      setError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      if (isOnline) {
        const res = await createSetlist(title, date);
        if (res.success) {
          onSuccess();
          onClose();
        } else {
          setError(`Erro: ${res.error}`);
        }
      } else {
        // Offline creation
        const tempId = `temp_${Date.now()}`;
        await db.setlists.add({
          id: tempId,
          title,
          date: new Date(date),
          songs: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          isSynced: false
        });

        await db.syncQueue.add({
          action: 'CREATE_SETLIST',
          payload: { title, date },
          createdAt: new Date()
        });

        onSuccess();
        onClose();
      }
    } catch (e: any) {
      setError(`Erro: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950 dark:text-slate-50">Criar Novo Repertório</h2>
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
        <form onSubmit={handleSubmit} className="p-4 md:p-6 flex flex-col gap-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-400 p-3 rounded-xl text-xs font-semibold text-center">
              {error}
            </div>
          )}

          {!isOnline && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-400 p-3 rounded-xl text-xs font-semibold text-center">
              Modo Offline: O repertório será sincronizado quando houver conexão.
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
              Nome do Repertório / Missa *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Missa de Domingo - Paróquia São José"
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 transition-all"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
              Data da Celebração *
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 transition-all cursor-pointer"
              required
            />
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-semibold py-2 px-4 rounded-xl text-sm transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 px-5 rounded-xl text-sm transition-all shadow-md active:scale-95"
            >
              {isSubmitting ? "Criando..." : "Criar Repertório"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
