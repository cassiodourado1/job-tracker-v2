import { Logger } from '@nestjs/common';
import type { JobSearchResult } from '@recruit/shared';
import { fetchPublicPage } from '../../safe-fetch';
import { jobPostingToResult, readJobPosting } from '../json-ld';
import type { DiscoveryQuery, DiscoverySource } from '../provider';
import { searchTermsFor } from '../provider';

/**
 * Portais brasileiros sem API, lidos pelo JSON-LD da página da vaga.
 *
 * Só entram aqui portais que atendem três condições, todas medidas:
 *
 *  1. Respondem ao User-Agent honesto do app, sem precisar se passar por
 *     navegador. A Catho devolve 403 para ele e ficou de fora por isso.
 *  2. `robots.txt` permite listagem e página de vaga.
 *  3. A listagem é renderizada no servidor. O TrabalhaBrasil monta a dele por
 *     JavaScript e exigiria navegador, então também ficou de fora.
 *
 * O custo é uma requisição por vaga — não dá para ler vinte vagas numa
 * resposta como nas APIs. Daí o teto baixo e o opt-in na tela.
 */

/** Uma requisição por vaga: vinte já são vinte e uma idas ao portal. */
const MAX_JOBS_PER_PORTAL = 12;

/** Ritmo humano, volume baixo — seção 5 do CLAUDE.md. */
const CONCURRENCY = 3;
const DELAY_MS = 250;

interface PortalConfig {
  readonly name: string;
  readonly origin: string;
  listingUrl(term: string): string;
  readonly jobHref: RegExp;
}

const PORTALS: PortalConfig[] = [
  {
    name: 'infojobs',
    origin: 'https://www.infojobs.com.br',
    listingUrl: (term) =>
      `https://www.infojobs.com.br/empregos.aspx?palabra=${encodeURIComponent(term)}`,
    jobHref: /href="(\/vaga-de-[^"]+__\d+\.aspx)"/g,
  },
  {
    name: 'vagas.com',
    origin: 'https://www.vagas.com.br',
    listingUrl: (term) =>
      `https://www.vagas.com.br/vagas-de-${encodeURIComponent(term)}`,
    jobHref: /href="(\/vagas\/v\d+\/[^"]+)"/g,
  },
];

export class BrazilPortalsSource implements DiscoverySource {
  readonly name = 'portais-br';

  /** Uma ida por vaga: precisa de bem mais fôlego que uma API de board. */
  readonly deadlineMs = 30_000;

  private readonly logger = new Logger(BrazilPortalsSource.name);

  async fetch(query: DiscoveryQuery): Promise<JobSearchResult[]> {
    // Só com a busca ampliada marcada. É o caminho lento e o usuário escolheu.
    if (!query.expanded) {
      return [];
    }

    // Só o primeiro termo: cada um custa uma listagem e doze páginas de vaga
    // por portal, e esta já é a fonte mais lenta. Sem termo não há listagem,
    // porque estes portais não têm "todas as vagas".
    const [term] = searchTermsFor(query);

    const portals = await Promise.allSettled(
      PORTALS.map((portal) => this.readPortal(portal, term)),
    );

    return portals.flatMap((portal) =>
      portal.status === 'fulfilled' ? portal.value : [],
    );
  }

  private async readPortal(
    portal: PortalConfig,
    term: string,
  ): Promise<JobSearchResult[]> {
    const listing = await fetchPublicPage(portal.listingUrl(term));

    const links = [
      ...new Set(
        [...listing.html.matchAll(portal.jobHref)].map(
          (match) => portal.origin + match[1],
        ),
      ),
    ].slice(0, MAX_JOBS_PER_PORTAL);

    if (links.length === 0) {
      // Listagem que responde 200 e não rende link é sinal de que o layout
      // mudou. Sem isto o portal viraria zero vagas em silêncio, e zero vagas
      // é indistinguível de "nada bateu com o filtro".
      this.logger.warn(
        `${portal.name}: listagem sem links de vaga — o padrão pode ter mudado.`,
      );

      return [];
    }

    const found: JobSearchResult[] = [];

    for (let start = 0; start < links.length; start += CONCURRENCY) {
      const batch = links.slice(start, start + CONCURRENCY);

      const pages = await Promise.allSettled(
        batch.map((url) => this.readJob(url, portal.name)),
      );

      for (const page of pages) {
        if (page.status === 'fulfilled' && page.value) {
          found.push(page.value);
        }
      }

      if (start + CONCURRENCY < links.length) {
        await sleep(DELAY_MS);
      }
    }

    return found;
  }

  private async readJob(
    url: string,
    source: string,
  ): Promise<JobSearchResult | null> {
    const page = await fetchPublicPage(url);
    const posting = readJobPosting(page.html);

    // Sem marcação, a vaga é descartada em vez de virar palpite. A extração
    // pelo Claude continua disponível para o link colado à mão.
    return posting ? jobPostingToResult(posting, page.finalUrl, source) : null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
