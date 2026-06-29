"use client";

import React from "react";
import { LiturgicalPart, LiturgicalSeason } from "@/generated/prisma/client";
import { PART_LABELS, SEASON_LABELS } from "@/utils/labels";

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
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-6 shadow-sm flex flex-col gap-4">
      {/* Search Input */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por título ou artista..."
          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 placeholder-slate-400 transition-all"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Liturgical Part Filter */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
            Momento da Missa
          </label>
          <select
            value={selectedPart}
            onChange={(e) => setSelectedPart(e.target.value as any)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 transition-all cursor-pointer"
          >
            <option value="ALL">Todos os Momentos</option>
            {Object.entries(PART_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Liturgical Season Filter */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
            Tempo Litúrgico
          </label>
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value as any)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 text-slate-950 dark:text-slate-50 transition-all cursor-pointer"
          >
            <option value="ALL">Todos os Tempos</option>
            {Object.entries(SEASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
