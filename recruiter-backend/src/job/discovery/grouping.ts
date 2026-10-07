import type {
  DiscoveredJob,
  JobSearchResult,
  JobVariant,
} from '@recruit/shared';
import { fold } from './normalize';

/**
 * Junta os anúncios da mesma vaga num card só.
 *
 * "Mesma vaga" é mesma empresa e mesmo título, comparados sem acento, caixa
 * nem espaço sobrando. É um critério de TELA, não de identidade: cada anúncio
 * continua com a própria URL, e é por ela que se salva e se descarta.
 *
 * Recebe a lista já ordenada e preserva a ordem. O primeiro anúncio do grupo,
 * o mais bem pontuado, vira o card; os demais vão para `others`. Por isso o
 * agrupamento roda DEPOIS de tirar o que você já resolveu: se o anúncio da
 * frente foi descartado, o seguinte assume o card em vez de o grupo sumir.
 */
export function groupSameJob<T extends { job: JobSearchResult }>(
  ranked: T[],
): (Omit<T, 'job'> & { job: DiscoveredJob })[] {
  const groups = new Map<string, Omit<T, 'job'> & { job: DiscoveredJob }>();

  for (const entry of ranked) {
    const key = sameJobKey(entry.job);
    const group = groups.get(key);

    if (group) {
      group.job.others.push(toVariant(entry.job));
      continue;
    }

    groups.set(key, { ...entry, job: { ...entry.job, others: [] } });
  }

  return [...groups.values()];
}

export function sameJobKey(job: JobSearchResult): string {
  return `${fold(job.company)}\u0000${fold(job.title)}`;
}

function toVariant(job: JobSearchResult): JobVariant {
  return {
    url: job.url,
    source: job.source,
    location: job.location,
    workModel: job.workModel,
    postedAt: job.postedAt,
  };
}
