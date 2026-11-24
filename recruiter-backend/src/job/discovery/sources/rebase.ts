import { z } from 'zod';
import type { JobSearchResult, Seniority } from '@recruit/shared';
import { htmlToText } from '../../html-to-text';
import { fetchPublicJson } from '../../safe-fetch';
import { canonicalJobUrl } from '../canonical-url';
import { fold, stackFromText, workModelFromText } from '../normalize';
import type { DiscoveryQuery, DiscoverySource } from '../provider';
import { searchTermsFor } from '../provider';

const ENDPOINT = 'https://rebasedev.com.br/api/v1/agent/jobs';
const PAGE_SIZE = 50;
const MAX_DESCRIPTION = 4_000;

const SKILLS = new Set([
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'cpp',
  'c',
  'java',
  'kotlin',
  'swift',
  'csharp',
  'php',
  'ruby',
  'elixir',
  'scala',
  'sql',
  'bash',
  'react',
  'nextjs',
  'vue',
  'angular',
  'svelte',
  'tailwind',
  'graphql',
  'nodejs',
  'html-css',
  'figma',
  'react-native',
  'flutter',
  'ios',
  'android',
  'aws',
  'gcp',
  'azure',
  'kubernetes',
  'docker',
  'terraform',
  'linux',
  'ci-cd',
  'postgres',
  'mysql',
  'mongodb',
  'redis',
  'kafka',
  'elasticsearch',
  'microservices',
  'distributed-systems',
  'rest-api',
  'grpc',
  'serverless',
  'observability',
  'machine-learning',
  'llm',
  'data-engineering',
  'devops',
  'sre',
  'system-design',
  'ai-assisted-dev',
  'security',
  'testing',
  'devrel',
  'embedded',
  'blockchain',
  'unity',
  'salesforce',
  'wordpress',
]);

const ALIASES: Record<string, string> = {
  'react.js': 'react',
  reactjs: 'react',
  'next.js': 'nextjs',
  next: 'nextjs',
  node: 'nodejs',
  'node.js': 'nodejs',
  'vue.js': 'vue',
  vuejs: 'vue',
  'c#': 'csharp',
  'c++': 'cpp',
  html: 'html-css',
  css: 'html-css',
  'html/css': 'html-css',
  rest: 'rest-api',
  restful: 'rest-api',
  postgresql: 'postgres',
  k8s: 'kubernetes',
  devops: 'devops',
  wordpress: 'wordpress',
};

const companySchema = z.object({ name: z.string().min(1) }).nullable();

const jobSchema = z
  .object({
    title: z.string().min(1),
    company: companySchema,
    location: z.string().nullable(),
    hires_in_brazil: z.string(),
    remote: z.boolean().nullable(),
    work_mode: z.string().nullable(),
    remoto_comprovado: z.boolean(),
    seniority: z.string().nullable(),
    skills: z.array(z.string()),
    hiring_models: z.array(z.string()),
    salary_min: z.number().int().nullable(),
    salary_max: z.number().int().nullable(),
    salary_currency: z.string().nullable(),
    published_at: z.string().nullable(),
    apply_url: z.string().url(),
    url: z.string().url(),
    description: z.string(),
    closed_at: z.string().nullable(),
  })
  .passthrough();

const responseSchema = z.object({
  data: z.array(z.unknown()),
  meta: z.object({
    ignored_params: z.array(z.object({ param: z.string() })).optional(),
  }),
});

export class RebaseJobsSource implements DiscoverySource {
  readonly name = 'rebase';

  constructor(private readonly token: string) {}

  async fetch(query: DiscoveryQuery): Promise<JobSearchResult[]> {
    const params = paramsFor(query);
    const url = new URL(ENDPOINT);

    for (const [key, value] of params) {
      url.searchParams.append(key, value);
    }

    const parsed = responseSchema.safeParse(await this.request(url));

    if (!parsed.success) {
      throw new Error('resposta inesperada da API Rebase Jobs');
    }

    if ((parsed.data.meta.ignored_params ?? []).length > 0) {
      throw new Error('a API Rebase Jobs ignorou filtros da busca');
    }

    return parsed.data.data
      .map(toResult)
      .filter((job): job is JobSearchResult => job !== null);
  }

  /**
   * A mensagem de erro vai para o log e para o aviso de fonte que falhou:
   * ela diz o que fazer e nomeia a variável, mas nunca carrega o token.
   */
  private async request(url: URL): Promise<unknown> {
    try {
      return await fetchPublicJson(url.toString(), {
        Authorization: `Bearer ${this.token}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = /respondeu (\d{3})/.exec(message)?.[1];

      if (status === '401' || status === '403') {
        throw new Error(
          `a API Rebase Jobs recusou o token (${status}): confira REBASE_JOBS_TOKEN`,
        );
      }
      if (status === '429') {
        throw new Error('a API Rebase Jobs limitou as consultas (429)');
      }
      throw new Error(`a API Rebase Jobs falhou: ${message || 'erro de rede'}`);
    }
  }
}

/** Uma chamada por atualização: skills aceitas usam filtro OR da API. */
export function paramsFor(query: DiscoveryQuery): URLSearchParams {
  const params = new URLSearchParams({
    por_pagina: String(PAGE_SIZE),
    esconder_ocultas: 'true',
    formato: 'texto',
  });
  const typed = query.q?.trim();

  if (typed) {
    if (typed.length >= 2) params.set('q', typed.slice(0, 80));
    return params;
  }

  const skills = [
    ...new Set(searchTermsFor(query).map(toSkill).filter(Boolean)),
  ].slice(0, 10);

  if (skills.length > 0) {
    for (const skill of skills) params.append('skill', skill);
    params.set('skills_modo', 'ou');
  } else {
    const term = searchTermsFor(query).find((item) => item.trim().length >= 2);
    if (term) params.set('q', term.trim().slice(0, 80));
  }

  return params;
}

function toSkill(value: string): string {
  const term = fold(value);
  const exact = ALIASES[term] ?? term.replace(/\s+/g, '-');
  return SKILLS.has(exact) ? exact : '';
}

export function toResult(raw: unknown): JobSearchResult | null {
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) return null;

  const job = parsed.data;
  if (job.closed_at || job.hires_in_brazil === 'no' || !job.company)
    return null;

  const url = canonicalJobUrl(job.apply_url);
  if (!url) return null;

  const description = htmlToText(job.description, MAX_DESCRIPTION) || null;
  const skills = job.skills.slice(0, 20);

  return {
    company: job.company.name.trim(),
    title: job.title.trim(),
    url,
    source: 'rebase',
    description,
    stack: [...new Set([...skills, ...stackFromText(job.title, description)])],
    requirements: [],
    benefits: [],
    seniority: seniority(job.seniority),
    workModel: job.work_mode
      ? workModelFromText(job.work_mode)
      : job.remoto_comprovado
        ? 'remoto'
        : null,
    contractType: contractType(job.hiring_models),
    location: job.location?.trim() || null,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    salaryCurrency: job.salary_currency,
    weeklyHours: null,
    postedAt: validDate(job.published_at),
  };
}

function seniority(value: string | null): Seniority | null {
  switch (fold(value ?? '')) {
    case 'junior':
      return 'junior';
    case 'pleno':
      return 'pleno';
    case 'senior':
      return 'senior';
    case 'staff':
      return 'staff';
    case 'lideranca':
      return 'lead';
    default:
      return null;
  }
}

function contractType(models: string[]): JobSearchResult['contractType'] {
  if (models.length !== 1) return null;
  return models[0] === 'clt' || models[0] === 'pj' ? models[0] : null;
}

function validDate(value: string | null): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
