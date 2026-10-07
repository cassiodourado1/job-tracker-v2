import { z } from 'zod';
import type { JobSearchResult, Seniority } from '@recruit/shared';
import { htmlToText } from '../../html-to-text';
import { fetchPublicJson } from '../../safe-fetch';
import { canonicalJobUrl } from '../canonical-url';
import {
  fold,
  seniorityFromTitle,
  stackFromText,
  toIsoDate,
} from '../normalize';
import type { DiscoveryQuery, DiscoverySource } from '../provider';
import { parseEach, searchTermsFor } from '../provider';

/**
 * Remotar — agregador brasileiro de vaga 100% remota.
 *
 * API pública, a mesma que o site usa, com busca por termo. Medido em outubro
 * de 2026: "front-end" rende 359 vagas de um acervo de ~10.800, e a maior
 * parte é de empresas brasileiras que publicam por InHire, Gupy e Solides.
 *
 * O que ela declara e as outras não:
 *
 *   tags       CLT, PJ e senioridade, escritas pelo próprio portal — mais
 *              confiável que deduzir do título.
 *   type       remoto ou híbrido, em campo próprio.
 *   link       aponta para a vaga ORIGINAL (`externalLink`). Uma vaga da Gupy
 *              que também está aqui vira a mesma URL canônica e é deduplicada.
 *
 * O que ela declara e NÃO é usado: `jobSalary`. Medido, vem como 0, como
 * "a combinar", ou com valores que não fecham ("900000 a 1200000 USD por
 * mês"). Faixa errada é pior que nenhuma.
 */

const ENDPOINT = 'https://api.remotar.com.br/jobs';

const PAGE_SIZE = 50;

/** Duas páginas por termo: 100 vagas, as mais recentes. */
const MAX_PAGES = 2;

/** Mesma regra da Gupy: nunca mais que três requisições simultâneas. */
const TERM_CONCURRENCY = 3;

const MAX_DESCRIPTION = 4_000;

/** Requisitos e benefícios viram lista na tela; vinte já é parede de texto. */
const MAX_ITEMS = 20;

const remotarJobSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  subtitle: z.string().nullish(),
  description: z.string().nullish(),
  type: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  active: z.boolean().nullish(),
  expired: z.boolean().nullish(),
  externalLink: z.string().nullish(),
  createdAt: z.string().nullish(),
  companyDisplayName: z.string().nullish(),
  company: z.object({ name: z.string().min(1) }).nullish(),
  jobTags: z
    .array(z.object({ tag: z.object({ name: z.string() }).nullish() }))
    .nullish(),
  jobRequirements: z
    .array(z.object({ description: z.string().nullish() }))
    .nullish(),
  jobBenefits: z
    .array(z.object({ description: z.string().nullish() }))
    .nullish(),
});

const remotarPageSchema = z.object({
  meta: z.object({ last_page: z.number().int() }),
  data: z.array(z.unknown()),
});

export class RemotarSource implements DiscoverySource {
  readonly name = 'remotar';

  async fetch(query: DiscoveryQuery): Promise<JobSearchResult[]> {
    const terms = searchTermsFor(query);
    const perTerm: PromiseSettledResult<JobSearchResult[]>[] = [];

    for (let start = 0; start < terms.length; start += TERM_CONCURRENCY) {
      perTerm.push(
        ...(await Promise.allSettled(
          terms
            .slice(start, start + TERM_CONCURRENCY)
            .map((term) => this.readTerm(term)),
        )),
      );
    }

    // Um termo que falha não derruba os outros; todos falhando, a fonte cai.
    const failure = perTerm.find((outcome) => outcome.status === 'rejected');

    if (failure && perTerm.every((outcome) => outcome.status === 'rejected')) {
      throw failure.reason;
    }

    const byUrl = new Map<string, JobSearchResult>();

    for (const outcome of perTerm) {
      if (outcome.status === 'fulfilled') {
        for (const item of outcome.value) {
          byUrl.set(item.url, item);
        }
      }
    }

    return [...byUrl.values()];
  }

  private async readTerm(term: string): Promise<JobSearchResult[]> {
    const found: JobSearchResult[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const payload = remotarPageSchema.safeParse(
        await fetchPublicJson(
          `${ENDPOINT}?search=${encodeURIComponent(term)}` +
            `&limit=${PAGE_SIZE}&page=${page}`,
        ),
      );

      if (!payload.success) {
        // Falha, e não lista vazia: aparece em `failedSources` na tela.
        throw new Error('resposta sem a lista de vagas — a API mudou');
      }

      found.push(...parseEach(payload.data.data, toResult).ok);

      if (page >= payload.data.meta.last_page) {
        break;
      }
    }

    return found;
  }
}

export function toResult(raw: unknown): JobSearchResult | null {
  const parsed = remotarJobSchema.safeParse(raw);

  if (!parsed.success) {
    return null;
  }

  const job = parsed.data;

  // A busca devolve vaga encerrada junto com a aberta.
  if (job.active === false || job.expired === true) {
    return null;
  }

  const company = job.company?.name ?? job.companyDisplayName;
  const url = canonicalJobUrl(
    job.externalLink || `https://remotar.com.br/job/${job.id}`,
  );

  if (!company || !url) {
    return null;
  }

  const tags = (job.jobTags ?? [])
    .map((item) => fold(item.tag?.name ?? ''))
    .filter(Boolean);

  const description = job.description
    ? htmlToText(job.description, MAX_DESCRIPTION)
    : null;

  return {
    company,
    title: job.title.trim(),
    url,
    source: 'remotar',
    description,
    stack: stackFromText(job.title, job.subtitle ?? null, description),
    requirements: texts(job.jobRequirements),
    benefits: texts(job.jobBenefits),
    seniority: seniorityFromTags(tags) ?? seniorityFromTitle(job.title),
    workModel: workModelFromRemotar(job.type),
    contractType: contractTypeFromTags(tags),
    location: locationFromRemotar(job.city, job.state, tags),
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    postedAt: toIsoDate(job.createdAt),
  };
}

function texts(
  items: { description?: string | null }[] | null | undefined,
): string[] {
  return (items ?? [])
    .map((item) => item.description?.trim() ?? '')
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

/** As tags vêm com emoji ("🧓🏽 Sênior"); `fold` não tira emoji, `includes` ignora. */
function seniorityFromTags(tags: string[]): Seniority | null {
  if (tags.some((tag) => tag.includes('senior'))) return 'senior';
  if (tags.some((tag) => tag.includes('pleno'))) return 'pleno';
  if (tags.some((tag) => tag.includes('junior'))) return 'junior';

  return null;
}

/**
 * CLT ou PJ só quando a vaga declara UM dos dois. Com as duas tags, a vaga
 * aceita qualquer um, e escolher uma faria ela sumir do filtro da outra.
 */
function contractTypeFromTags(tags: string[]): JobSearchResult['contractType'] {
  const clt = tags.some((tag) => /\bclt\b/.test(tag));
  const pj = tags.some((tag) => /\bpj\b/.test(tag));

  if (clt === pj) {
    return null;
  }

  return clt ? 'clt' : 'pj';
}

function workModelFromRemotar(
  type: string | null | undefined,
): JobSearchResult['workModel'] {
  switch (type) {
    case 'remote':
      return 'remoto';
    case 'hybrid':
      return 'hibrido';
    default:
      return null;
  }
}

/**
 * A Remotar é um portal brasileiro: vaga sem marca de internacional é para
 * quem está no Brasil. Com a marca, a localização fica em branco em vez de
 * chutar o país — e vaga sem localização passa pelos dois escopos.
 */
function locationFromRemotar(
  city: string | null | undefined,
  state: string | null | undefined,
  tags: string[],
): string | null {
  const international = tags.some(
    (tag) => tag.includes('internacional') || tag.includes('moeda estrangeira'),
  );

  if (international) {
    return null;
  }

  return [city, state, 'Brasil'].filter(Boolean).join(', ');
}
