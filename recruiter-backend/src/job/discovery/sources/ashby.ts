import { z } from 'zod';
import type { JobSearchResult } from '@recruit/shared';
import { fetchPublicJson } from '../../safe-fetch';
import { canonicalJobUrl } from '../canonical-url';
import {
  contractTypeFromLabel,
  seniorityFromTitle,
  stackFromText,
  toIsoDate,
} from '../normalize';
import type { DiscoveryQuery, DiscoverySource } from '../provider';
import { boardsFor, parseEach } from '../provider';

/**
 * Ashby — o formato mais bem estruturado das três fontes por empresa.
 *
 * É a única que declara `isRemote` como booleano, país em campo próprio e
 * descrição já em texto puro, sem HTML. Várias empresas brasileiras publicam
 * por ele, com locais no Brasil declarados no campo certo.
 */

const MAX_DESCRIPTION = 4_000;

const ashbyJobSchema = z.object({
  title: z.string().min(1),
  jobUrl: z.string().min(1),
  employmentType: z.string().nullish(),
  location: z.string().nullish(),
  publishedAt: z.string().nullish(),
  isListed: z.boolean().nullish(),
  isRemote: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  address: z
    .object({
      postalAddress: z
        .object({ addressCountry: z.string().nullish() })
        .nullish(),
    })
    .nullish(),
});

const ashbyBoardSchema = z.object({ jobs: z.array(z.unknown()) });

export class AshbySource implements DiscoverySource {
  readonly name = 'ashby';

  /**
   * Os slugs do `.env` — ver `watchlist.ts`. A cada rodada somam-se as
   * empresas que o perfil acompanha nesta plataforma.
   */
  constructor(private readonly boards: readonly string[]) {}

  async fetch(query: DiscoveryQuery = {}): Promise<JobSearchResult[]> {
    const boards = await Promise.allSettled(
      boardsFor(query, 'ashby', this.boards).map(async (slug) => {
        const payload = ashbyBoardSchema.safeParse(
          await fetchPublicJson(
            `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
          ),
        );

        if (!payload.success) {
          return [];
        }

        return parseEach(payload.data.jobs, (raw) => toResult(raw, slug)).ok;
      }),
    );

    // allSettled e nao all: um board acima do teto de tamanho, fora do ar ou
    // com slug morto some da rodada — sem levar os outros junto.
    return boards.flatMap((board) =>
      board.status === 'fulfilled' ? board.value : [],
    );
  }
}

function toResult(raw: unknown, slug: string): JobSearchResult | null {
  const parsed = ashbyJobSchema.safeParse(raw);

  if (!parsed.success) {
    return null;
  }

  const job = parsed.data;

  // `isListed: false` é vaga tirada do ar que continua na resposta.
  if (job.isListed === false) {
    return null;
  }

  const url = canonicalJobUrl(job.jobUrl);

  if (!url) {
    return null;
  }

  const description = job.descriptionPlain?.trim()
    ? job.descriptionPlain.slice(0, MAX_DESCRIPTION)
    : null;

  const country = job.address?.postalAddress?.addressCountry?.trim() || null;
  const location =
    [job.location?.trim(), country].filter(Boolean).join(', ') || null;

  return {
    company: titleCase(slug),
    title: job.title,
    url,
    source: 'ashby',
    description,
    stack: stackFromText(job.title, description),
    requirements: [],
    benefits: [],
    seniority: seniorityFromTitle(job.title),
    workModel: workModelFromAshby(job.workplaceType, job.isRemote),
    contractType: contractTypeFromLabel(job.employmentType ?? null),
    location,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    postedAt: toIsoDate(job.publishedAt ?? null),
  };
}

function workModelFromAshby(
  workplaceType: string | null | undefined,
  isRemote: boolean | null | undefined,
): JobSearchResult['workModel'] {
  switch (workplaceType) {
    case 'Remote':
      return 'remoto';
    case 'Hybrid':
      return 'hibrido';
    case 'OnSite':
      return 'presencial';
    default:
      return isRemote ? 'remoto' : null;
  }
}

function titleCase(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}
