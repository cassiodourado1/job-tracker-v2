import type { FitVerdict } from "@recruit/shared";

/** Rótulo e cor do veredito, os mesmos no painel da vaga e no card da lista. */
export const VERDICT_LABEL: Record<FitVerdict, string> = {
  forte: "forte",
  boa: "boa",
  parcial: "parcial",
  fraca: "fraca",
};

export const VERDICT_TONE: Record<FitVerdict, string> = {
  forte: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  boa: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  parcial: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  fraca: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
