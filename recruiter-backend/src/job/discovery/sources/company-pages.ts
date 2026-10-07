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
} from '../normalize';
import type { DiscoveryQuery, DiscoverySource } from '../provider';
import { parseEach } from '../provider';
import { workModelFromGupy } from './gupy';

/**
 * Empresas acompanhadas que não estão em Greenhouse, Lever ou Ashby — essas
 * três já têm fonte própria e recebem a lista do perfil por `boardsFor`.
 *
 * Aqui entram Gupy e InHire, lidas pela página de carreira da EMPRESA, e não
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

  readonly deadlineMs = 30_000;

  private readonly logger = new Logger(CompanyPagesSource.name);

  private readonly readers: Partial<Record<WatchedPlatform, Reader>> = {
    gupy: readGupyCompany,
    inhire: readInhireCompany,
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
