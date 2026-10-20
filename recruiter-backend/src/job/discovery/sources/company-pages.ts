import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type {
  JobSearchResult,
  WatchedCompany,
  WatchedPlatform,
} from '@recruit/shared';
import { fetchPublicJson, fetchPublicPage } from '../../safe-fetch';
import { canonicalJobUrl } from '../canonical-url';
import {
  contractTypeFromLabel,
  seniorityFromTitle,
  stackFromText,
  workModelFromTitle,
} from '../normalize';
import type { DiscoveryQuery, DiscoverySource } from '../provider';
import { parseEach } from '../provider';
import { workModelFromGupy } from './gupy';

/**
 * Empresas acompanhadas que não estão em Greenhouse, Lever ou Ashby — essas
 * três já têm fonte própria e recebem a lista do perfil por `boardsFor`.
 *
 * Aqui entram Gupy, InHire e Workday, lidas pela página de carreira da EMPRESA, e não
 * pela busca do portal: a busca só acha o que casa com os seus termos; a
 * página da empresa traz todas as vagas dela. É o que faz "acompanhar a
 * CI&T" ser diferente de "procurar front-end".
 *
 * Uma requisição por empresa, três ao mesmo tempo (§5). Empresa que falha
 * fica fora da rodada sem levar as outras; só todas falhando derruba a fonte.
 */

type Reader = (slug: string) => Promise<JobSearchResult[]>;

const COMPANY_CONCURRENCY = 3;

export class CompanyPagesSource implements DiscoverySource {
  readonly name = 'empresas';

  /** A Workday lê em páginas, com pausa entre elas: mais fôlego que as outras. */
  readonly deadlineMs = 40_000;

  private readonly logger = new Logger(CompanyPagesSource.name);

  private readonly readers: Partial<Record<WatchedPlatform, Reader>> = {
    gupy: readGupyCompany,
    inhire: readInhireCompany,
    workday: readWorkdayCompany,
  };

  async fetch(query: DiscoveryQuery): Promise<JobSearchResult[]> {
    const companies = (query.companies ?? []).filter(
      (company) => this.readers[company.platform],
    );

    if (companies.length === 0) {
      return [];
    }

    const outcomes: PromiseSettledResult<JobSearchResult[]>[] = [];

    for (
      let start = 0;
      start < companies.length;
      start += COMPANY_CONCURRENCY
    ) {
      outcomes.push(
        ...(await Promise.allSettled(
          companies
            .slice(start, start + COMPANY_CONCURRENCY)
            .map((company) => this.read(company)),
        )),
      );
    }

    const failures = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    );

    if (failures.length === outcomes.length) {
      throw failures[0].reason;
    }

    return outcomes.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? outcome.value : [],
    );
  }

  private async read(company: WatchedCompany): Promise<JobSearchResult[]> {
    try {
      return await this.readers[company.platform]!(company.slug);
    } catch (error) {
      // O nome da empresa no log: sem ele, "empresas falhou" não diz qual.
      this.logger.warn(
        `${company.platform}/${company.slug}: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
      throw error;
    }
  }
}

/* -------------------------------- Gupy -------------------------------- */

/**
 * A página `<empresa>.gupy.io` traz TODAS as vagas da empresa no
 * `__NEXT_DATA__` — 784 no PagBank, sem paginação, em 373 KB. Sem descrição e
 * sem data; o que vem é título, contrato, modalidade e endereço.
 */
const gupyCompanyPageSchema = z.object({
  props: z.object({
    pageProps: z.object({
      careerPage: z.object({ name: z.string().min(1) }).nullish(),
      jobs: z.array(z.unknown()),
    }),
  }),
});

const gupyCompanyJobSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  type: z.string().nullish(),
  workplace: z
    .object({
      workplaceType: z.string().nullish(),
      address: z
        .object({
          city: z.string().nullish(),
          stateShortName: z.string().nullish(),
          country: z.string().nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

export async function readGupyCompany(
  slug: string,
): Promise<JobSearchResult[]> {
  const { html } = await fetchPublicPage(`https://${slug}.gupy.io/`);
  const page = readGupyCompanyPage(html);

  if (!page) {
    throw new Error('página da empresa sem a lista de vagas — o layout mudou');
  }

  const company = page.company ?? slug;

  return parseEach(page.jobs, (raw) => gupyJobToResult(raw, slug, company)).ok;
}

export function readGupyCompanyPage(
  html: string,
): { company: string | null; jobs: unknown[] } | null {
  const match = NEXT_DATA.exec(html);

  if (!match) {
    return null;
  }

  try {
    const parsed = gupyCompanyPageSchema.safeParse(JSON.parse(match[1]));

    return parsed.success
      ? {
          company: parsed.data.props.pageProps.careerPage?.name ?? null,
          jobs: parsed.data.props.pageProps.jobs,
        }
      : null;
  } catch {
    return null;
  }
}

function gupyJobToResult(
  raw: unknown,
  slug: string,
  company: string,
): JobSearchResult | null {
  const parsed = gupyCompanyJobSchema.safeParse(raw);

  if (!parsed.success) {
    return null;
  }

  const job = parsed.data;

  // Banco de talentos não é vaga — mesma regra da busca da Gupy.
  if (job.type?.includes('talent_pool')) {
    return null;
  }

  const url = canonicalJobUrl(`https://${slug}.gupy.io/jobs/${job.id}`);

  if (!url) {
    return null;
  }

  const address = job.workplace?.address;

  return {
    company,
    title: job.title.trim(),
    url,
    source: 'empresas',
    description: null,
    stack: stackFromText(job.title),
    requirements: [],
    benefits: [],
    seniority: seniorityFromTitle(job.title),
    workModel: workModelFromGupy(job.workplace?.workplaceType, null),
    contractType: contractTypeFromLabel(job.type ?? null),
    location:
      [address?.city, address?.stateShortName, address?.country]
        .filter(Boolean)
        .join(', ') || null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    postedAt: null,
  };
}

/* ------------------------------- InHire ------------------------------- */

/**
 * A InHire monta a página no navegador, a partir da API pública que o próprio
 * site usa: a empresa vai no cabeçalho `X-Tenant`. Devolve só as vagas
 * publicadas, com título, modalidade e local.
 */
const inhirePageSchema = z.object({
  tenantName: z.string().nullish(),
  jobsPage: z.array(z.unknown()),
});

const inhireJobSchema = z.object({
  jobId: z.string().min(1),
  displayName: z.string().min(1),
  status: z.string().nullish(),
  workplaceType: z.string().nullish(),
  location: z.string().nullish(),
});

export async function readInhireCompany(
  slug: string,
): Promise<JobSearchResult[]> {
  const page = inhirePageSchema.safeParse(
    await fetchPublicJson('https://api.inhire.app/job-posts/public/pages', {
      'X-Tenant': slug,
      'X-Inhire-Client': 'web-inhire',
    }),
  );

  if (!page.success) {
    throw new Error('resposta sem a lista de vagas — a API mudou');
  }

  const company = page.data.tenantName?.trim() || slug;

  return parseEach(page.data.jobsPage, (raw) =>
    inhireJobToResult(raw, slug, company),
  ).ok;
}

export function inhireJobToResult(
  raw: unknown,
  slug: string,
  company: string,
): JobSearchResult | null {
  const parsed = inhireJobSchema.safeParse(raw);

  if (!parsed.success || (parsed.data.status ?? 'published') !== 'published') {
    return null;
  }

  const job = parsed.data;
  const url = canonicalJobUrl(`https://${slug}.inhire.app/vagas/${job.jobId}`);

  if (!url) {
    return null;
  }

  const title = job.displayName.trim();

  return {
    company,
    title,
    url,
    source: 'empresas',
    description: null,
    stack: stackFromText(title),
    requirements: [],
    benefits: [],
    seniority: seniorityFromTitle(title),
    workModel: workModelFromInhire(job.workplaceType),
    contractType: null,
    // "São Paulo, SP, BR": o país vem em sigla, e "BR" é o que
    // `countryFromText` precisa ver por extenso.
    location: job.location
      ? job.location.replace(/,\s*BR$/i, ', Brasil')
      : null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    postedAt: null,
  };
}

function workModelFromInhire(
  type: string | null | undefined,
): JobSearchResult['workModel'] {
  switch ((type ?? '').toLowerCase()) {
    case 'remote':
      return 'remoto';
    case 'hybrid':
      return 'hibrido';
    case 'on-site':
    case 'onsite':
      return 'presencial';
    default:
      return null;
  }
}

/* ------------------------------- Workday ------------------------------ */

/**
 * A Workday é onde empresas grandes publicam vagas (Accenture, Avanade…). A
 * página monta a lista no navegador, a partir da API pública que ela mesma
 * usa: `POST /wday/cxs/<empresa>/<site>/jobs`, com filtro e página no corpo.
 *
 * O acervo é mundial — 2.000 vagas na Accenture — e o que interessa é o
 * Brasil: a primeira consulta só descobre o código do país nos filtros, e as
 * seguintes leem as vagas dele, 20 por página. A lista não traz descrição; ler
 * vaga por vaga multiplicaria as chamadas, e a Workday responde 429 rápido a
 * quem insiste. Por isso poucas páginas, em sequência, com pausa (§5).
 */

const WORKDAY_PAGE = 20;
const WORKDAY_MAX_PAGES = 5;
const WORKDAY_DELAY_MS = 1_000;

const workdayFacetValueSchema = z.object({
  descriptor: z.string().nullish(),
  id: z.string().nullish(),
  facetParameter: z.string().nullish(),
  get values() {
    return z.array(workdayFacetValueSchema).nullish();
  },
});

const workdayListSchema = z.object({
  total: z.number().int().nullish(),
  jobPostings: z.array(z.unknown()),
  facets: z
    .array(
      z.object({
        facetParameter: z.string(),
        values: z.array(workdayFacetValueSchema).nullish(),
      }),
    )
    .nullish(),
});

const workdayJobSchema = z.object({
  title: z.string().min(1),
  externalPath: z.string().startsWith('/'),
  locationsText: z.string().nullish(),
  postedOn: z.string().nullish(),
});

export async function readWorkdayCompany(
  slug: string,
  now: Date = new Date(),
  delay: (ms: number) => Promise<void> = sleep,
): Promise<JobSearchResult[]> {
  const parts = /^([a-z0-9-]+)\.(wd\d+)\/([A-Za-z0-9_-]+)$/.exec(slug);

  if (!parts) {
    throw new Error('identificador da Workday inválido');
  }

  const [, tenant, pod, site] = parts;
  const origin = `https://${tenant}.${pod}.myworkdayjobs.com`;
  const api = `${origin}/wday/cxs/${tenant}/${site}/jobs`;
  const ask = async (body: object) => {
    const parsed = workdayListSchema.safeParse(
      await fetchPublicJson(api, {}, { query: body }),
    );

    if (!parsed.success) {
      throw new Error('resposta sem a lista de vagas — a API mudou');
    }

    return parsed.data;
  };

  const first = await ask({
    appliedFacets: {},
    limit: 1,
    offset: 0,
    searchText: '',
  });
  const brazil = brazilFacet(first.facets ?? []);

  // Empresa sem vaga no Brasil: nada a ler, e nada de erro.
  if (!brazil) {
    return [];
  }

  const company = workdayCompanyName(site, tenant);
  const found: JobSearchResult[] = [];

  for (let page = 0; page < WORKDAY_MAX_PAGES; page += 1) {
    await delay(WORKDAY_DELAY_MS);

    let list: z.infer<typeof workdayListSchema>;

    try {
      list = await ask({
        appliedFacets: { [brazil.parameter]: [brazil.id] },
        limit: WORKDAY_PAGE,
        offset: page * WORKDAY_PAGE,
        searchText: '',
      });
    } catch (error) {
      // A Workday corta com 429 quem pede muito seguido. No meio da
      // leitura, as páginas já lidas valem; só a primeira derruba a empresa.
      if (page > 0) {
        break;
      }

      throw error;
    }

    found.push(
      ...parseEach(list.jobPostings, (raw) =>
        workdayJobToResult(raw, origin, site, company, now),
      ).ok,
    );

    if (
      list.jobPostings.length < WORKDAY_PAGE ||
      (page + 1) * WORKDAY_PAGE >= (list.total ?? 0)
    ) {
      break;
    }
  }

  return found;
}

/**
 * O filtro "Brasil" da empresa: o país vem como valor de um grupo de
 * localização, e o nome do parâmetro (`locationCountry`, `Location_Country`…)
 * varia de empresa para empresa — por isso se procura pelo nome do país.
 */
export function brazilFacet(
  facets: z.infer<typeof workdayListSchema>['facets'] & object,
): { parameter: string; id: string } | null {
  const visit = (
    values: z.infer<typeof workdayFacetValueSchema>[],
    parameter: string,
  ): { parameter: string; id: string } | null => {
    for (const value of values) {
      if (value.values) {
        const found = visit(value.values, value.facetParameter ?? parameter);

        if (found) {
          return found;
        }
      } else if (
        value.id &&
        /^(brazil|brasil)$/i.test(value.descriptor?.trim() ?? '')
      ) {
        return { parameter, id: value.id };
      }
    }

    return null;
  };

  for (const facet of facets) {
    const found = visit(facet.values ?? [], facet.facetParameter);

    if (found && /country/i.test(found.parameter)) {
      return found;
    }
  }

  return null;
}

export function workdayJobToResult(
  raw: unknown,
  origin: string,
  site: string,
  company: string,
  now: Date,
): JobSearchResult | null {
  const parsed = workdayJobSchema.safeParse(raw);

  if (!parsed.success) {
    return null;
  }

  const job = parsed.data;
  const url = canonicalJobUrl(`${origin}/${site}${job.externalPath}`);

  if (!url) {
    return null;
  }

  const title = job.title.trim();
  const place = job.locationsText?.trim();

  return {
    company,
    title,
    url,
    source: 'empresas',
    description: null,
    stack: stackFromText(title),
    requirements: [],
    benefits: [],
    seniority: seniorityFromTitle(title),
    workModel: workModelFromTitle(title),
    contractType: null,
    // A lista já vem filtrada pelo Brasil; "2 Locations" e afins não são
    // lugar, e viram só o país.
    location:
      place && !/^\d+ locations?$/i.test(place) ? `${place}, Brasil` : 'Brasil',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    postedAt: postedOnToIso(job.postedOn ?? null, now),
  };
}

/**
 * "Posted Today", "Posted Yesterday", "Posted 5 Days Ago". "30+ Days Ago" não
 * é data, é teto: vira nula em vez de uma data inventada.
 */
export function postedOnToIso(label: string | null, now: Date): string | null {
  const value = (label ?? '').toLowerCase();
  const day = 24 * 60 * 60 * 1000;

  if (value.includes('today')) {
    return now.toISOString();
  }

  if (value.includes('yesterday')) {
    return new Date(now.getTime() - day).toISOString();
  }

  const days = /posted (\d+) days? ago/.exec(value);

  return days
    ? new Date(now.getTime() - Number(days[1]) * day).toISOString()
    : null;
}

/** "AccentureCareers" → "Accenture"; sem nada a tirar, o nome da empresa na URL. */
export function workdayCompanyName(site: string, tenant: string): string {
  const name = site
    .replace(/(external|leadership)?(careers?|jobs?|site)?$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  const base = name || tenant;

  return base.charAt(0).toUpperCase() + base.slice(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
