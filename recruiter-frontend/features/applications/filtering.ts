import { APPLICATION_STATUSES, isClosedStatus } from "@recruit/shared";
import type { Application, ApplicationStatus } from "@recruit/shared";

/**
 * Busca, filtro e ordenação da lista de candidaturas.
 *
 * No navegador, sobre a lista que a página já trouxe: é um usuário, com
 * dezenas de candidaturas, e cada tecla da busca virar requisição seria
 * latência sem ganho. Se a lista um dia passar de milhares, isto vira
 * parâmetro do endpoint.
 */

export type DatePreset = "any" | "7" | "30" | "90" | "custom";

export type SortKey = "newest" | "oldest" | "status-advanced" | "status-early";

export interface ApplicationFilters {
  query: string;
  /** Vazio quer dizer "todos". */
  statuses: ApplicationStatus[];
  date: DatePreset;
  /** `AAAA-MM-DD`, só em `custom`. */
  from: string;
  to: string;
  sort: SortKey;
}

export const EMPTY_FILTERS: ApplicationFilters = {
  query: "",
  statuses: [],
  date: "any",
  from: "",
  to: "",
  sort: "newest",
};

export function isFiltering(filters: ApplicationFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.statuses.length > 0 ||
    filters.date !== "any"
  );
}

export function applyFilters(
  applications: Application[],
  filters: ApplicationFilters,
  now: Date,
): Application[] {
  const terms = fold(filters.query).split(/\s+/).filter(Boolean);
  const range = dateRange(filters, now);

  return applications
    .filter((application) => {
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(application.status)
      ) {
        return false;
      }

      if (range) {
        const created = new Date(application.createdAt).getTime();

        if (created < range.from || created > range.to) {
          return false;
        }
      }

      if (terms.length === 0) {
        return true;
      }

      // Todos os termos, cada um em qualquer campo: "backend remoto" acha a
      // vaga de backend que é remota, e não toda vaga que tenha uma das
      // duas palavras.
      const haystack = searchableText(application);

      return terms.every((term) => haystack.includes(term));
    })
    .sort(comparator(filters.sort));
}

/**
 * Tudo que dá para procurar numa candidatura. Anotações entram: é onde fica
 * "falei com a Ana do RH", e é justamente o que você lembra na hora de buscar.
 */
function searchableText(application: Application): string {
  const { job } = application;

  return fold(
    [
      job.company,
      job.title,
      job.location,
      job.seniority,
      job.workModel,
      job.url,
      application.status,
      application.notes,
      application.resumeVersion?.label,
    ]
      .filter(Boolean)
      .join(" \n "),
  );
}

/**
 * O intervalo de cadastro, em milissegundos, ou `null` para qualquer data.
 *
 * O dia final conta inteiro: "até 30/09" inclui o que foi cadastrado às
 * 23h do dia 30.
 */
function dateRange(
  filters: ApplicationFilters,
  now: Date,
): { from: number; to: number } | null {
  if (filters.date === "any") {
    return null;
  }

  if (filters.date === "custom") {
    const from = filters.from ? localDay(filters.from).getTime() : -Infinity;
    const to = filters.to
      ? localDay(filters.to).getTime() + DAY_MS - 1
      : Infinity;

    return from === -Infinity && to === Infinity ? null : { from, to };
  }

  return {
    from: now.getTime() - Number(filters.date) * DAY_MS,
    to: Infinity,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` como meia-noite local, não UTC: é o dia que você escolheu. */
function localDay(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);

  return new Date(year, month - 1, day);
}

/**
 * A ordem do funil, com `rejeitado` e `cancelado` no fim: encerram a partir
 * de qualquer etapa e não são degraus mais fundos que `oferta`. Ordenar por
 * "avanço" com eles no topo esconderia as ofertas debaixo das recusas.
 */
const FUNNEL_DEPTH: Record<ApplicationStatus, number> = Object.fromEntries(
  APPLICATION_STATUSES.map((status, index) => [
    status,
    isClosedStatus(status) ? -1 : index,
  ]),
) as Record<ApplicationStatus, number>;

function comparator(
  sort: SortKey,
): (a: Application, b: Application) => number {
  const created = (application: Application) =>
    new Date(application.createdAt).getTime();
  const newestFirst = (a: Application, b: Application) =>
    created(b) - created(a);

  switch (sort) {
    case "oldest":
      return (a, b) => created(a) - created(b);
    case "status-advanced":
      // Empate na etapa: a mais recente primeiro.
      return (a, b) =>
        FUNNEL_DEPTH[b.status] - FUNNEL_DEPTH[a.status] || newestFirst(a, b);
    case "status-early":
      return (a, b) =>
        early(a.status) - early(b.status) || newestFirst(a, b);
    default:
      return newestFirst;
  }
}

/** Do começo do funil para o fim, e os encerrados por último também aqui. */
function early(status: ApplicationStatus): number {
  return isClosedStatus(status)
    ? APPLICATION_STATUSES.length
    : FUNNEL_DEPTH[status];
}

/** Minúsculas e sem acento: "sao paulo" acha "São Paulo". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
