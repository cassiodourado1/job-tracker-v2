import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { watchlistFrom } from './watchlist';
import type {
  DiscoverResult,
  JobPreferences,
  JobSearchResult,
} from '@recruit/shared';
import { AshbySource } from './sources/ashby';
import { BrazilPortalsSource } from './sources/br-portals';
import { GreenhouseSource } from './sources/greenhouse';
import { GupySource } from './sources/gupy';
import { LeverSource } from './sources/lever';
import { PrismaService } from '../../prisma/prisma.service';
import { LinkedInAlertsSource } from './sources/linkedin-alerts';
import { RemotarSource } from './sources/remotar';
import { RemoteOkSource, RemotiveSource } from './sources/remote-boards';
import { matches, matchesTerm } from './filters';
import { fold } from './normalize';
import type { DiscoveryQuery, DiscoverySource } from './provider';
import { searchTermsFor } from './provider';
import { scoreJob, sortKey } from './scoring';

/**
 * Junta as fontes, filtra, ordena e fatia.
 *
 * Roda dentro da requisição, e não numa fila. É o certo por enquanto: medido,
 * onze boards em paralelo levam 2,9 segundos, e o resultado fica em cache por
 * 15 minutos — então só a primeira busca da sessão espera. Fila entra quando
 * houver varredura agendada rodando sem ninguém na tela.
 */

/**
 * Quarenta, e não vinte: a tela mostra até quatro por linha, então vinte vagas
 * são cinco linhas — você chegaria ao fim da lista a cada dois gestos de
 * rolagem. Fatiar mais custa zero, porque o acervo inteiro já está em memória
 * depois da primeira busca.
 */
const BATCH_SIZE = 40;

/** Vagas mudam em dias, não em minutos. */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Uma fonte lenta não pode segurar o lote inteiro. */
const SOURCE_DEADLINE_MS = 15_000;

interface CacheEntry {
  at: number;
  items: JobSearchResult[];
  failed: string[];
}

interface Collected extends Omit<CacheEntry, 'at'> {
  /** Tempo de rede desta chamada. Zero quando veio do cache. */
  fetchMs: number;
}

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  private readonly sources: DiscoverySource[];

  constructor(prisma: PrismaService, config: ConfigService<Env, true>) {
    const watchlist = watchlistFrom(config);

    this.sources = [
      new GupySource(),
      // Logo depois da Gupy: a Remotar repassa vaga dela, e a ordem do array
      // decide qual versão fica. A da Gupy declara o contrato em campo
      // próprio; a da Remotar, por tag.
      new RemotarSource(),
      new GreenhouseSource(watchlist.greenhouse),
      new AshbySource(watchlist.ashby),
      new LeverSource(watchlist.lever),
      new RemoteOkSource(),
      new RemotiveSource(),
      new BrazilPortalsSource(),
      // Por último: a ordem do array é prioridade de deduplicação, e o alerta
      // é o registro mais pobre de qualquer vaga que ele compartilhe — não
      // traz descrição. Se a mesma vaga vier do Greenhouse, a versão rica vence.
      new LinkedInAlertsSource(prisma),
    ];
  }

  private readonly cache = new Map<string, CacheEntry>();

  async discover(params: {
    q?: string;
    expanded?: boolean;
    skills: string[];
    preferences: JobPreferences;
    excludedUrls: Set<string>;
    cursor?: string;
  }): Promise<DiscoverResult> {
    const { items, failed, fetchMs } = await this.collect({
      q: params.q,
      expanded: params.expanded,
      terms: params.preferences.searchTerms,
    });

    const eligible = items
      .filter((job) => matches(job, params.preferences))
      .filter((job) => matchesTerm(job, params.q));

    const ranked = eligible
      .map((job) => ({
        job,
        key: sortKey(job, scoreJob(job, params.skills, params.preferences)),
      }))
      .sort((a, b) => (a.key < b.key ? -1 : 1));

    const unseen = ranked.filter(
      ({ job }) => !params.excludedUrls.has(job.url),
    );

    // Chave ordenável, e não deslocamento: o usuário descarta vagas entre uma
    // requisição e a seguinte, o conjunto encolhe, e um deslocamento numérico
    // pularia em silêncio tantas vagas quantas foram removidas.
    const after = params.cursor
      ? unseen.filter(({ key }) => key > params.cursor!)
      : unseen;

    const page = after.slice(0, BATCH_SIZE);
    const last = page.at(-1);

    return {
      items: page.map(({ job }) => job),
      nextCursor: after.length > page.length && last ? last.key : null,
      total: eligible.length,
      exhausted:
        page.length > 0 ? null : eligible.length > 0 ? 'nada-novo' : 'fim',
      failedSources: failed,
      fetchMs,
    };
  }

  /**
   * Busca em todas as fontes, com cache por termo.
   *
   * `Promise.allSettled` com prazo por fonte: um board fora do ar ou lento vira
   * um nome na lista de falhas, e a tela mostra que a cobertura foi parcial em
   * vez de fingir que o acervo é aquele.
   */
  private async collect(query: DiscoveryQuery): Promise<Collected> {
    // A flag entra na chave: sem isso, marcar "ampliar" devolveria o resultado
    // estreito que já estava em memória. Os termos efetivos também: dois
    // perfis com termos diferentes, ou o mesmo perfil depois de trocá-los,
    // não podem receber o acervo um do outro.
    const key = [
      query.expanded ? '+' : '-',
      ...searchTermsFor(query).map(fold),
    ].join('|');
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return { items: cached.items, failed: cached.failed, fetchMs: 0 };
    }

    const started = Date.now();

    const settled = await Promise.allSettled(
      this.sources.map((source) => withDeadline(source, query)),
    );

    const items: JobSearchResult[] = [];
    const failed: string[] = [];
    const byUrl = new Set<string>();

    settled.forEach((outcome, index) => {
      const source = this.sources[index];

      if (outcome.status === 'rejected') {
        failed.push(source.name);
        this.logger.warn(
          `Fonte ${source.name} falhou: ${describe(outcome.reason)}`,
        );

        return;
      }

      for (const job of outcome.value) {
        // A mesma vaga aparece em mais de uma fonte — o RemoteOK republica
        // anúncio que também está no board da empresa.
        if (byUrl.has(job.url)) {
          continue;
        }

        byUrl.add(job.url);
        items.push(job);
      }
    });

    this.logger.log(
      `Descoberta: ${items.length} vagas de ${this.sources.length - failed.length}/${this.sources.length} fontes em ${Date.now() - started}ms`,
    );

    const fetchMs = Date.now() - started;

    this.cache.set(key, { at: Date.now(), items, failed });

    return { items, failed, fetchMs };
  }
}

async function withDeadline(
  source: DiscoverySource,
  query: DiscoveryQuery,
): Promise<JobSearchResult[]> {
  const limit = source.deadlineMs ?? SOURCE_DEADLINE_MS;

  return Promise.race([
    source.fetch(query),
    new Promise<never>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error(`prazo de ${limit}ms estourado`)),
        limit,
      ).unref(),
    ),
  ]);
}

function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
