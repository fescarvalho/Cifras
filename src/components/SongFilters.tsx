"use client";

import React from "react";
import { LiturgicalPart, LiturgicalSeason } from "@/generated/prisma/client";
import { PART_LABELS, SEASON_LABELS } from "@/utils/labels";
import { Search, X, Sparkles } from "lucide-react";

interface SongFiltersProps {
  search: string;
  setSearch: (s: string) => void;
  selectedPart: LiturgicalPart | "ALL";
  setSelectedPart: (p: LiturgicalPart | "ALL") => void;
  selectedSeason: LiturgicalSeason | "ALL";
  setSelectedSeason: (s: LiturgicalSeason | "ALL") => void;
}

export default function SongFilters({
  search,
  setSearch,
  selectedPart,
  setSelectedPart,
  selectedSeason,
  setSelectedSeason,
}: SongFiltersProps) {
  const partEntries = Object.entries(PART_LABELS) as [LiturgicalPart, string][];
  const seasonEntries = Object.entries(SEASON_LABELS) as [LiturgicalSeason, string][];

  return (
    <div className="flex flex-col gap-3">
      {/* Search Bar */}
      <div className="relative group">
        <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 group-focus-within:text-violet-600 dark:group-focus-within:text-violet-400 transition-colors">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar música, cantor ou ministério..."
          className="w-full bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl py-3 pl-11 pr-10 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-violet-500/80 focus:border-violet-500 text-slate-950 dark:text-slate-50 placeholder-slate-400 dark:placeholder-slate-500 transition-all"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Limpar busca"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Horizontal Swipeable Chips: Momento Litúrgico */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 py-0.5">
        <button
          type="button"
          onClick={() => setSelectedPart("ALL")}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
            selectedPart === "ALL"
              ? "bg-violet-600 text-white shadow-sm shadow-violet-500/25"
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:border-violet-300 dark:hover:border-slate-700"
          }`}
        >
          Todos
        </button>
        {partEntries.map(([value, label]) => {
          const active = selectedPart === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setSelectedPart(active ? "ALL" : value)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                active
                  ? "bg-violet-600 text-white shadow-sm shadow-violet-500/25"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:border-violet-300 dark:hover:border-slate-700"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Horizontal Swipeable Chips: Tempo Litúrgico */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pr-1 shrink-0">
          <Sparkles className="w-3 h-3 text-violet-500" />
          Tempo:
        </span>
        <button
          type="button"
          onClick={() => setSelectedSeason("ALL")}
          className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 cursor-pointer ${
            selectedSeason === "ALL"
              ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
              : "bg-slate-100/90 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          Qualquer
        </button>
        {seasonEntries.map(([value, label]) => {
          const active = selectedSeason === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setSelectedSeason(active ? "ALL" : value)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 cursor-pointer ${
                active
                  ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100/90 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
