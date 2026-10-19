import type {
  DashboardWindow,
  JobDrilldown,
  JobsDashboard,
  JobSearchResult,
  WorkModel,
} from '@recruit/shared';
import { sameJobKey } from './discovery/grouping';

/**
 * Os números do painel do mercado, a partir das vagas que passaram nos
 * filtros. Puro: recebe a lista e o "agora", e se testa sem rede nem banco.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const WINDOW_MS: Record<DashboardWindow, number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
};

/** Dez barras ainda se leem; a vigésima empresa com uma vaga não informa. */
const TOP = 10;

const TIME_ZONE = 'America/Sao_Paulo';

export function buildDashboard(
  jobs: JobSearchResult[],
  window: DashboardWindow,
  now: Date,
  failedSources: string[] = [],
): JobsDashboard {
  // Uma vaga anunciada em três sites é UMA vaga: conta a primeira, que pela
  // ordem das fontes é a de registro mais rico.
  const unique = new Map<string, JobSearchResult>();

  for (const job of jobs) {
    const key = sameJobKey(job);

    if (!unique.has(key)) {
      unique.set(key, job);
    }
  }

  const span = WINDOW_MS[window];
  const end = now.getTime();
  const inWindow: JobSearchResult[] = [];
  let previousTotal = 0;
  let undated = 0;

  for (const job of unique.values()) {
    const at = job.postedAt ? Date.parse(job.postedAt) : NaN;

    if (Number.isNaN(at)) {
      undated += 1;
    } else if (at > end - span && at <= end) {
      inWindow.push(job);
    } else if (at > end - 2 * span && at <= end - span) {
      previousTotal += 1;
    }
  }

  return {
    window,
    generatedAt: now.toISOString(),
    total: inWindow.length,
    previousTotal,
    remote: inWindow.filter((job) => job.workModel === 'remoto').length,
    companies: new Set(inWindow.map((job) => companyKey(job.company))).size,
    undated,
    bySource: ranked(inWindow.map((job) => job.source)).map(
      ([source, count]) => ({ source, count }),
    ),
    byCompany: topCompanies(inWindow),
    byWorkModel: ranked(inWindow.map((job) => job.workModel ?? '')).map(
      ([workModel, count]) => ({
        workModel: (workModel || null) as WorkModel | null,
        count,
      }),
    ),
    byStack: ranked(inWindow.flatMap((job) => job.stack))
      .slice(0, TOP)
      .map(([stack, count]) => ({ stack, count })),
    timeline: timeline(inWindow, window, now),
    failedSources,
  };
}

/**
 * Empresas pelo nome sem caixa e acento ("Nubank" e "NUBANK" são uma), e
 * mostradas com a grafia da primeira vaga.
 */
function topCompanies(jobs: JobSearchResult[]) {
  const names = new Map<string, string>();

  for (const job of jobs) {
    const key = companyKey(job.company);

    if (!names.has(key)) {
      names.set(key, job.company.trim());
    }
  }

  return ranked(jobs.map((job) => companyKey(job.company)))
    .slice(0, TOP)
    .map(([key, count]) => ({ company: names.get(key) ?? key, count }));
}

/**
 * A vaga está no recorte que você clicou no painel?
 *
 * Mesmas regras do painel — empresa sem caixa e acento, janela pela data de
 * publicação —, para a tela de Vagas mostrar as vagas que o número contou.
 */
export function matchesDrilldown(
  job: JobSearchResult,
  drill: JobDrilldown,
  now: Date,
): boolean {
  if (drill.source && job.source !== drill.source) {
    return false;
  }

  if (drill.company && companyKey(job.company) !== companyKey(drill.company)) {
    return false;
  }

  if (drill.stack && !job.stack.includes(drill.stack)) {
    return false;
  }

  if (drill.workModel && (job.workModel ?? 'nao-informa') !== drill.workModel) {
    return false;
  }

  if (drill.postedWithin) {
    const at = job.postedAt ? Date.parse(job.postedAt) : NaN;
    const end = now.getTime();

    if (
      Number.isNaN(at) ||
      at <= end - WINDOW_MS[drill.postedWithin] ||
      at > end
    ) {
      return false;
    }
  }

  return true;
}

function companyKey(company: string): string {
  return company.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Contagem por valor, do maior para o menor; empate em ordem alfabética. */
function ranked(values: string[]): [string, number][] {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort(
    ([a, x], [b, y]) => y - x || a.localeCompare(b),
  );
}

/**
 * Uma barra por hora (24h) ou por dia (7d, 30d), no horário de Brasília,
 * incluindo as vazias: uma barra que some parece dado faltando, não zero.
 */
function timeline(
  jobs: JobSearchResult[],
  window: DashboardWindow,
  now: Date,
): JobsDashboard['timeline'] {
  const hourly = window === '24h';
  const step = hourly ? HOUR_MS : DAY_MS;
  const count = hourly ? 24 : WINDOW_MS[window] / DAY_MS;
  const buckets = new Map<string, JobsDashboard['timeline'][number]>();

  for (let i = count - 1; i >= 0; i--) {
    const key = bucketKey(new Date(now.getTime() - i * step), hourly);

    buckets.set(key, { key, total: 0, bySource: {} });
  }

  for (const job of jobs) {
    const bucket = buckets.get(bucketKey(new Date(job.postedAt!), hourly));

    if (bucket) {
      bucket.total += 1;
      bucket.bySource[job.source] = (bucket.bySource[job.source] ?? 0) + 1;
    }
  }

  return [...buckets.values()];
}

function bucketKey(date: Date, hourly: boolean): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const day = `${parts.year}-${parts.month}-${parts.day}`;

  return hourly ? `${day}T${parts.hour}` : day;
}
