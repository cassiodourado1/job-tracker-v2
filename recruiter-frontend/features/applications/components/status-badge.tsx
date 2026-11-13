import { APPLICATION_STATUSES } from "@recruit/shared";
import type { ApplicationStatus } from "@recruit/shared";

/**
 * Cores acompanham o avanço no funil — cinza no rascunho, verde na oferta,
 * vermelho na rejeição. Ver a lista inteira e entender onde cada uma está sem
 * ler texto é o ponto. Vaga cancelada é pedra, neutra: não foi derrota, e em
 * vermelho se confundiria com a recusa de longe.
 */
export const statusTone: Record<ApplicationStatus, string> = {
  rascunho:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  aplicado:
    "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  triagem:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  entrevista:
    "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  teste:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  oferta:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  rejeitado:
    "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  cancelado:
    "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusTone[status]}`}
    >
      {status}
    </span>
  );
}

export { APPLICATION_STATUSES };
