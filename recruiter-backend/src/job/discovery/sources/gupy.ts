import { z } from 'zod';
import type { JobSearchResult } from '@recruit/shared';
import { htmlToText } from '../../html-to-text';
import { fetchPublicPage } from '../../safe-fetch';
import { canonicalJobUrl } from '../canonical-url';
import {
  contractTypeFromLabel,
  seniorityFromTitle,
  stackFromText,
  toIsoDate,
} from '../normalize';
import type { DiscoveryQuery, DiscoverySource } from '../provider';
import { parseEach, searchTermsFor } from '../provider';

/**
 * Gupy — a fonte que cobre o mercado brasileiro.
 *
 * É busca por palavra-chave sobre o acervo inteiro, sem watchlist, e é a única
 * fonte aqui que declara modalidade E tipo de contrato em campos próprios: o
 * `type` mapeia direto para o enum do projeto (efetivo = CLT, pessoa jurídica =
 * PJ, estágio, temporário), o que nenhum ATS internacional consegue dar.
 *
 * Lê a PÁGINA de busca do portal, e não uma API. A API pública
 * (`employability-portal.gupy.io/api/v1/jobs`) passou a responder 404 para
 * tudo em outubro de 2026: o portal agora busca pelo próprio servidor, por
 * endereço interno. A página renderizada traz as mesmas vagas, com os mesmos
 * campos, no JSON que o Next embute em `__NEXT_DATA__`. O `robots.txt` do
 * portal não proíbe nada.
 */

const SEARCH_URL = 'https://portal.gupy.io/job-search';

/** O portal devolve 12 por página, e não aceita outro tamanho. */
const PAGE_SIZE = 12;

/**
 * Cinco páginas por termo: 60 vagas, as mais recentes. Era uma requisição de
 * 100 vagas; agora cada 12 custam uma página inteira, e a regra de ritmo
 * humano do §5 vale mais que o volume.
 */
const MAX_PAGES = 5;

/** Ritmo humano entre páginas do mesmo termo — §5. */
const DELAY_MS = 250;

/** Termos lidos ao mesmo tempo. Com seis termos, são duas levas de três. */
const TERM_CONCURRENCY = 3;

/** Descrição truncada: o acervo inteiro fica em memória durante a rodada. */
const MAX_DESCRIPTION = 4_000;

const gupyJobSchema = z.object({
  name: z.string().min(1),
  jobUrl: z.string().min(1),
  careerPageName: z.string().min(1),
  description: z.string().nullish(),
  type: z.string().nullish(),
  publishedDate: z.string().nullish(),
  workplaceType: z.string().nullish(),
  isRemoteWork: z.boolean().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  country: z.string().nullish(),
});

const nextDataSchema = z.object({
  props: z.object({
    pageProps: z.object({
      initialJobList: z.object({ data: z.array(z.unknown()) }),
    }),
  }),
});

const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/**
 * As vagas cruas de uma página de busca, ou `null` quando a página não tem a
 * forma esperada.
 *
 * `null`, e não lista vazia, de propósito: "a busca não achou nada" e "o
 * portal mudou o layout" precisam ser distinguíveis, senão a fonte vira zero
 * vagas em silêncio — foi exatamente assim que a troca da API passou
 * despercebida.
 */
export function readGupySearchPage(html: string): unknown[] | null {
  const match = NEXT_DATA.exec(html);

  if (!match) {
    return null;
  }

  let json: unknown;

  try {
    json = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const parsed = nextDataSchema.safeParse(json);

  return parsed.success
    ? parsed.data.props.pageProps.initialJobList.data
    : null;
}

export class GupySource implements DiscoverySource {
  readonly name = 'gupy';

  /** Uma página por 12 vagas: precisa de mais fôlego que uma API. */
  readonly deadlineMs = 30_000;

  async fetch(query: DiscoveryQuery): Promise<JobSearchResult[]> {
    // Sem termo, a Gupy devolve o acervo inteiro, e a maioria não é vaga
    // técnica: `searchTermsFor` sempre devolve ao menos um.
    const terms = searchTermsFor(query);
    const byUrl = new Map<string, JobSearchResult>();

    // Termos em levas de três, páginas de cada termo em sequência: nunca mais
    // que três requisições simultâneas ao portal.
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

    // Um termo que falha não derruba os outros. Só quando todos falham a
    // fonte inteira é dada como fora do ar.
    const failure = perTerm.find((outcome) => outcome.status === 'rejected');

    if (failure && perTerm.every((outcome) => outcome.status === 'rejected')) {
      throw failure.reason;
    }

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
      const { html } = await fetchPublicPage(
        `${SEARCH_URL}/term=${encodeURIComponent(term)}&page=${page}`,
      );
      const raw = readGupySearchPage(html);

      if (raw === null) {
        // Falha, e não lista vazia: aparece em `failedSources` na tela.
        throw new Error(
          'página de busca sem a lista de vagas — o layout mudou',
        );
      }

      found.push(...parseEach(raw, toResult).ok);

      if (raw.length < PAGE_SIZE) {
        break;
      }

      await sleep(DELAY_MS);
    }

    return found;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toResult(raw: unknown): JobSearchResult | null {
  const parsed = gupyJobSchema.safeParse(raw);

  if (!parsed.success) {
    return null;
  }

  const job = parsed.data;
  const url = canonicalJobUrl(job.jobUrl);

  if (!url) {
    return null;
  }

  // Banco de talentos não é vaga: não tem cargo definido nem processo aberto.
  // Entra na fila como se fosse e faz o usuário triar lixo.
  if (job.type?.includes('talent_pool')) {
    return null;
  }

  const description = job.description
    ? htmlToText(job.description, MAX_DESCRIPTION)
    : null;

  const location =
    [job.city, job.state, job.country].filter(Boolean).join(', ') || null;

  return {
    company: job.careerPageName,
    title: job.name,
    url,
    source: 'gupy',
    description,
    stack: stackFromText(job.name, description),
    requirements: [],
    benefits: [],
    seniority: seniorityFromTitle(job.name),
    workModel: workModelFromGupy(job.workplaceType, job.isRemoteWork),
    contractType: contractTypeFromLabel(job.type ?? null),
    location,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    postedAt: toIsoDate(job.publishedDate),
  };
}

export function workModelFromGupy(
  workplaceType: string | null | undefined,
  isRemote: boolean | null | undefined,
): JobSearchResult['workModel'] {
  switch (workplaceType) {
    case 'remote':
      return 'remoto';
    case 'hybrid':
      return 'hibrido';
    case 'on-site':
      return 'presencial';
    default:
      // O campo vem vazio em parte das vagas; o booleano é a segunda pista.
      return isRemote ? 'remoto' : null;
  }
}
