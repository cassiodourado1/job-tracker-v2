import { Logger } from '@nestjs/common';
import type { JobSearchResult } from '@recruit/shared';
import { fetchPublicPage } from '../../safe-fetch';
import { jobPostingToResult, readJobPosting } from '../json-ld';
import { fold } from '../normalize';
import type { DiscoveryQuery, DiscoverySource } from '../provider';
import { searchTermsFor } from '../provider';

/**
 * GeekHunter — portal brasileiro só de vagas de tecnologia, com muita vaga de
 * consultoria (NTT Data, Kyndryl, NAVA…). Medido em outubro de 2026: ~750
 * vagas abertas, 25 por página.
 *
 * Sem API e sem busca: `?q=` e afins devolvem outra página, sem a lista. O
 * que existe é a listagem geral, que vem com um `schema.org/ItemList` (título
 * e endereço de cada vaga). A página de cada vaga traz o `JobPosting`
 * completo — data de publicação e `TELECOMMUTE` para remota —, lido pelo
 * mesmo `json-ld.ts` dos portais.
 *
 * Por isso duas etapas: lê as listagens mais recentes, separa pelo título o
 * que é desenvolvimento e só então abre as vagas, com teto e pausa (§5). O
 * `robots.txt` libera `/pt/vagas` e as páginas de vaga; fecha só áreas de
 * candidato e de empresa.
 */

const ORIGIN = 'https://www.geekhunter.com';

/** As mais recentes primeiro: quatro páginas são ~100 vagas, uns dias de publicação. */
const MAX_PAGES = 4;

/** Uma requisição por vaga: o teto é o que mantém o ritmo humano. */
const MAX_JOBS = 30;

const CONCURRENCY = 3;
const DELAY_MS = 300;

/**
 * Quanto vale uma vaga já lida. A página de uma vaga não muda depois de
 * publicada; sem esta memória, cada rodada reabria as mesmas trinta páginas
 * — 30 segundos medidos — para achar duas ou três novas.
 */
const READ_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Títulos de desenvolvimento. Só decide o que vale abrir — a vaga ainda passa
 * pelos filtros do perfil depois. Termos do perfil entram junto, para quem
 * procura outra coisa ("dados", "QA") não ficar sem nada.
 */
const DEV_TITLE =
  /desenvolvedor|desenvolvedora|developer|programador|engenheir[oa] de software|software engineer|\bdev\b|front.?end|back.?end|full.?stack|mobile|android|\bios\b/;

export interface ListedJob {
  url: string;
  title: string;
}

export class GeekHunterSource implements DiscoverySource {
  readonly name = 'geekhunter';

  /** Listagens mais trinta páginas de vaga, em lotes de três com pausa. */
  readonly deadlineMs = 45_000;

  private readonly logger = new Logger(GeekHunterSource.name);

  /** Vaga já aberta, por endereço. `null` guarda "sem marcação": não reabrir. */
  private readonly read = new Map<
    string,
    { at: number; job: JobSearchResult | null }
  >();

  async fetch(query: DiscoveryQuery): Promise<JobSearchResult[]> {
    const terms = searchTermsFor(query).map(fold);
    const listed: ListedJob[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { html } = await fetchPublicPage(
        page === 1 ? `${ORIGIN}/pt/vagas` : `${ORIGIN}/pt/vagas?page=${page}`,
      );
      const items = readGeekHunterList(html);

      if (items.length === 0) {
        if (page === 1) {
          // Listagem que responde 200 e não rende vaga é layout mudado. Sem
          // isto a fonte viraria zero vagas em silêncio.
          throw new Error('listagem sem ItemList de vagas — o layout mudou');
        }

        break;
      }

      listed.push(...items);
      await sleep(DELAY_MS);
    }

    const wanted = [
      ...new Map(
        listed
          .filter((job) => isWanted(job.title, terms))
          .map((job) => [job.url, job]),
      ).values(),
    ].slice(0, MAX_JOBS);

    const now = Date.now();

    for (const [url, entry] of this.read) {
      if (now - entry.at > READ_TTL_MS) {
        this.read.delete(url);
      }
    }

    const fresh = wanted.filter((job) => !this.read.has(job.url));

    for (let start = 0; start < fresh.length; start += CONCURRENCY) {
      const batch = fresh.slice(start, start + CONCURRENCY);
      const pages = await Promise.allSettled(
        batch.map((job) => this.readJob(job.url)),
      );

      // Falha de rede não é guardada: a vaga é tentada de novo na próxima.
      pages.forEach((page, index) => {
        if (page.status === 'fulfilled') {
          this.read.set(batch[index].url, { at: now, job: page.value });
        }
      });

      if (start + CONCURRENCY < fresh.length) {
        await sleep(DELAY_MS);
      }
    }

    const found = wanted
      .map((job) => this.read.get(job.url)?.job)
      .filter((job): job is JobSearchResult => Boolean(job));

    this.logger.log(
      `geekhunter: ${listed.length} na listagem, ${wanted.length} de dev, ${fresh.length} abertas agora, ${found.length} vagas`,
    );

    return found;
  }

  private async readJob(url: string): Promise<JobSearchResult | null> {
    const page = await fetchPublicPage(url);
    const posting = readJobPosting(page.html);

    // Sem marcação, a vaga é descartada em vez de virar palpite.
    return posting
      ? jobPostingToResult(posting, page.finalUrl, 'geekhunter')
      : null;
  }
}

/**
 * As vagas do `ItemList` da listagem. Só endereços do próprio portal, no
 * formato de vaga (`/pt/<empresa>/jobs/<vaga>`): o que vier de fora disso
 * não é aberto.
 */
export function readGeekHunterList(html: string): ListedJob[] {
  const blocks = html.matchAll(
    /<script[^<>]*type=["']application\/ld\+json["'][^<>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const block of blocks) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(block[1].trim());
    } catch {
      continue;
    }

    const list = parsed as {
      '@type'?: string;
      itemListElement?: { url?: unknown; name?: unknown }[];
    };

    if (list['@type'] !== 'ItemList' || !Array.isArray(list.itemListElement)) {
      continue;
    }

    return list.itemListElement.flatMap((item) =>
      typeof item.url === 'string' &&
      typeof item.name === 'string' &&
      isJobUrl(item.url)
        ? [{ url: item.url, title: item.name.trim() }]
        : [],
    );
  }

  return [];
}

function isJobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return (
      parsed.origin === ORIGIN &&
      /^\/pt\/[^/]+\/jobs\/[^/]+$/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/** Vale abrir a vaga? Título de desenvolvimento, ou com um termo do perfil. */
export function isWanted(title: string, terms: string[]): boolean {
  const value = fold(title);

  return DEV_TITLE.test(value) || terms.some((term) => value.includes(term));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
