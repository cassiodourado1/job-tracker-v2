import type { JobSearchResult, Seniority } from '@recruit/shared';
import { htmlToText } from '../../html-to-text';
import { fetchPublicPage } from '../../safe-fetch';
import { canonicalJobUrl } from '../canonical-url';
import {
  fold,
  seniorityFromTitle,
  stackFromText,
  toIsoDate,
} from '../normalize';
import type { DiscoveryQuery, DiscoverySource } from '../provider';
import { searchTermsFor } from '../provider';

/**
 * Nerdin — portal brasileiro só de vagas de TI.
 *
 * Sem API, mas com busca por termo (`vagas.php?busca_vaga=`), 20 por página.
 * Lê só a listagem: o card já traz empresa, local, contrato, senioridade,
 * modalidade, tecnologias (as hashtags) e a data de publicação exata. A
 * página de cada vaga tem um `JobPosting` em JSON-LD, mas lê-la custaria uma
 * requisição por vaga para ganhar só a descrição. O `robots.txt` libera as
 * páginas de vaga.
 *
 * Salário não vem: medido em outubro de 2026, 46 de 60 cards dizem "Salário a
 * combinar" e o resto não diz nada.
 */

const ORIGIN = 'https://www.nerdin.com.br';

/** Duas páginas por termo: 40 vagas, as mais recentes. */
const MAX_PAGES = 2;
const PAGE_SIZE = 20;

/** Mesma regra das outras fontes por busca: no máximo três ao mesmo tempo. */
const TERM_CONCURRENCY = 3;

const DELAY_MS = 400;

export interface NerdinCard {
  path: string;
  title: string;
  summary: string[];
  company: string | null;
  place: string | null;
  /** O `datetime` do <time> do card: data exata, não o "Há 2 horas". */
  publishedAt: string | null;
  hashtags: string[];
}

export class NerdinSource implements DiscoverySource {
  readonly name = 'nerdin';

  readonly deadlineMs = 30_000;

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
      const { html } = await fetchPublicPage(
        `${ORIGIN}/vagas.php?busca_vaga=${encodeURIComponent(term)}` +
          (page > 1 ? `&pagina=${page}` : ''),
      );

      // Sem o formulário de busca, a página não é a listagem: layout mudou.
      // Com ele e sem card, a busca só não achou nada.
      if (!html.includes('busca_vaga')) {
        throw new Error('página sem a listagem de vagas — o layout mudou');
      }

      const cards = readNerdinCards(html);

      found.push(
        ...cards
          .map(cardToResult)
          .filter((job): job is JobSearchResult => job !== null),
      );

      if (cards.length < PAGE_SIZE) {
        break;
      }

      await sleep(DELAY_MS);
    }

    return found;
  }
}

/** Os cards de uma página de busca. Card sem link ou sem título é pulado. */
export function readNerdinCards(html: string): NerdinCard[] {
  const cards: NerdinCard[] = [];

  for (const chunk of html.split('<div class="vaga-card"').slice(1)) {
    const path = /^\s*data-href="(vaga_emprego\/[^"]+\.php)"/.exec(chunk)?.[1];
    const heading = /<h3 class="vaga-titulo"[^>]*>([\s\S]*?)<\/h3>/.exec(
      chunk,
    )?.[1];

    if (!path || !heading) {
      continue;
    }

    // O selo "Nova" é um <span> dentro do título.
    const title = text(heading.replace(/<span\b[^>]*>[\s\S]*?<\/span>/g, ''));

    if (!title) {
      continue;
    }

    const summary = text(
      /<p class="vaga-resumo-linha"[^>]*>([\s\S]*?)<\/p>/.exec(chunk)?.[1] ??
        '',
    )
      .split('•')
      .map((part) => part.trim())
      .filter(Boolean);

    cards.push({
      path,
      title,
      summary,
      company: field(
        chunk,
        /<span class="vaga-empresa-nome"[^>]*>([\s\S]*?)<\/span>/,
      ),
      place: field(
        chunk,
        /<div class="vaga-local-linha"[^>]*>([\s\S]*?)<\/div>/,
      ),
      publishedAt: /<time\b[^>]*\bdatetime="([^"]+)"/.exec(chunk)?.[1] ?? null,
      hashtags: [
        ...chunk.matchAll(/class="hashtag"[^>]*>\s*#([^<]+?)\s*</g),
      ].map((match) => text(match[1])),
    });
  }

  return cards;
}

export function cardToResult(card: NerdinCard): JobSearchResult | null {
  const url = canonicalJobUrl(`${ORIGIN}/${card.path}`);

  if (!url || !card.company) {
    return null;
  }

  const summary = card.summary.map(fold);

  return {
    company: card.company,
    title: card.title,
    url,
    source: 'nerdin',
    description: null,
    stack: stackFromText(card.title, card.hashtags.join(', ')),
    requirements: [],
    benefits: [],
    seniority: seniorityFromSummary(summary) ?? seniorityFromTitle(card.title),
    workModel: workModelFromSummary(summary, card.place),
    contractType: contractTypeFromSummary(summary),
    location: locationFromPlace(card.place),
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    postedAt: toIsoDate(card.publishedAt),
  };
}

function seniorityFromSummary(summary: string[]): Seniority | null {
  if (summary.includes('senior')) return 'senior';
  if (summary.includes('pleno')) return 'pleno';
  if (summary.includes('junior')) return 'junior';

  return null;
}

/** "CLT, PJ" aceita os dois: escolher um faria a vaga sumir do outro filtro. */
function contractTypeFromSummary(
  summary: string[],
): JobSearchResult['contractType'] {
  const all = summary.join(' ');
  const clt = /\bclt\b/.test(all);
  const pj = /\bpj\b/.test(all);

  if (clt !== pj) {
    return clt ? 'clt' : 'pj';
  }

  if (!clt && /\bestagio\b/.test(all)) {
    return 'estagio';
  }

  return null;
}

function workModelFromSummary(
  summary: string[],
  place: string | null,
): JobSearchResult['workModel'] {
  const all = [...summary, fold(place ?? '')].join(' ');

  if (all.includes('home office') || all.includes('remoto')) return 'remoto';
  if (all.includes('hibrido')) return 'hibrido';
  if (all.includes('presencial')) return 'presencial';

  return null;
}

/** "São Paulo • SP" vira "São Paulo, SP, Brasil"; "Home Office" não é lugar. */
function locationFromPlace(place: string | null): string | null {
  const value = (place ?? '').trim();

  if (!value || /home office|remoto/i.test(value)) {
    return 'Brasil';
  }

  return `${value
    .split('•')
    .map((part) => part.trim())
    .join(', ')}, Brasil`;
}

function field(chunk: string, pattern: RegExp): string | null {
  const match = pattern.exec(chunk)?.[1];

  return match ? text(match) || null : null;
}

function text(html: string): string {
  return htmlToText(html, 300).replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
