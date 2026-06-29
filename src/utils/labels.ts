import { LiturgicalPart, LiturgicalSeason } from "@/generated/prisma/client";

export const PART_LABELS: Record<LiturgicalPart, string> = {
  ENTRADA: "Entrada",
  SALMO: "Salmo",
  PERDAO: "Perdão",
  GLORIA: "Glória",
  ACLAMACAO: "Aclamação",
  OFERTORIO: "Ofertório",
  SANTO: "Santo",
  RESPOSTAS_EUCARISTICAS: "Respostas Eucarísticas",
  AMEM: "Amém",
  CORDEIRO: "Cordeiro",
  COMUNHAO: "Comunhão",
  ACAO_DE_GRACAS: "Ação de Graças",
  CANTO_FINAL: "Canto Final",
  ESPECIAL: "Especial",
};

export const PART_COLORS: Record<LiturgicalPart, string> = {
  ENTRADA: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50",
  SALMO: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border-orange-100 dark:border-orange-900/50",
  PERDAO: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-100 dark:border-amber-900/50",
  GLORIA: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900/50",
  ACLAMACAO: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border-sky-100 dark:border-sky-900/50",
  OFERTORIO: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50",
  SANTO: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400 border-violet-100 dark:border-violet-900/50",
  RESPOSTAS_EUCARISTICAS: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/40 dark:text-fuchsia-400 border-fuchsia-100 dark:border-fuchsia-900/50",
  AMEM: "bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400 border-pink-100 dark:border-pink-900/50",
  CORDEIRO: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-100 dark:border-rose-900/50",
  COMUNHAO: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400 border-teal-100 dark:border-teal-900/50",
  ACAO_DE_GRACAS: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400 border-cyan-100 dark:border-cyan-900/50",
  CANTO_FINAL: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-100 dark:border-blue-900/50",
  ESPECIAL: "bg-slate-50 text-slate-700 dark:bg-slate-900/40 dark:text-slate-400 border-slate-100 dark:border-slate-800/50",
};

export const SEASON_LABELS: Record<LiturgicalSeason, string> = {
  ADVENTO: "Advento",
  NATAL: "Natal",
  QUARESMA: "Quaresma",
  TEMPO_COMUM: "Tempo Comum",
  PASCOA: "Páscoa",
};

export const SEASON_COLORS: Record<LiturgicalSeason, string> = {
  ADVENTO: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  NATAL: "bg-stone-100 text-stone-800 dark:bg-stone-800/50 dark:text-stone-300",
  QUARESMA: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300",
  TEMPO_COMUM: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  PASCOA: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
};
