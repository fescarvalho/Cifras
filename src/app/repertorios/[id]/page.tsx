import React from "react";
import SetlistManager from "@/components/SetlistManager";
import Link from "next/link";

export default async function PublicSetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-300">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-4 px-4 md:px-8 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/repertorios"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 active:bg-slate-100 dark:active:bg-slate-800 rounded-full transition-all text-slate-600 dark:text-slate-400 active:scale-95"
              title="Voltar para Repertórios"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                Visualização
              </h1>
              <p className="text-[10px] md:text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Modo Leitura
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 flex flex-col gap-6">
        <SetlistManager setlistId={id} readOnly={true} />
      </main>
    </div>
  );
}
