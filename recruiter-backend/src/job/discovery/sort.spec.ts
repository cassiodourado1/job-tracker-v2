import type { JobSearchResult, JobSort } from '@recruit/shared';
import { sortKey } from './scoring';

function vaga(
  url: string,
  extra: Partial<JobSearchResult> = {},
): JobSearchResult {
  return {
    company: 'Empresa',
    title: 'Desenvolvedor',
    url,
    source: 'gupy',
    description: null,
    stack: [],
    requirements: [],
    benefits: [],
    seniority: null,
    workModel: null,
    contractType: null,
    location: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    postedAt: null,
    ...extra,
  };
}

/** Ordena como a descoberta ordena: pela chave, crescente. */
function ordena(
  vagas: { job: JobSearchResult; score: number }[],
  sort: JobSort,
): string[] {
  return vagas
    .map(({ job, score }) => ({ url: job.url, key: sortKey(job, score, sort) }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map(({ url }) => url);
}

describe('sortKey', () => {
  it('recentes: data mais nova primeiro, sem data no fim', () => {
    expect(
      ordena(
        [
          {
            job: vaga('https://x/velha', {
              postedAt: '2026-09-01T12:00:00.000Z',
            }),
            score: 900,
          },
          { job: vaga('https://x/sem-data'), score: 999 },
          {
            job: vaga('https://x/nova', {
              postedAt: '2026-10-07T12:00:00.000Z',
            }),
            score: 100,
          },
        ],
        'recentes',
      ),
    ).toEqual(['https://x/nova', 'https://x/velha', 'https://x/sem-data']);
  });

  it('relevancia: pontuação maior primeiro', () => {
    expect(
      ordena(
        [
          { job: vaga('https://x/a'), score: 300 },
          { job: vaga('https://x/b'), score: 800 },
        ],
        'relevancia',
      ),
    ).toEqual(['https://x/b', 'https://x/a']);
  });

  it('empresa: alfabética sem acento nem caixa, prefixo antes do nome maior', () => {
    expect(
      ordena(
        [
          { job: vaga('https://x/1', { company: 'Acme Labs' }), score: 900 },
          { job: vaga('https://x/2', { company: 'Ábaco' }), score: 100 },
          { job: vaga('https://x/3', { company: 'acme' }), score: 100 },
        ],
        'empresa',
      ),
    ).toEqual(['https://x/2', 'https://x/3', 'https://x/1']);
  });

  it('cargo: alfabética pelo título, pontuação desempata', () => {
    expect(
      ordena(
        [
          { job: vaga('https://x/1', { title: 'Front-end' }), score: 100 },
          { job: vaga('https://x/2', { title: 'Back-end' }), score: 100 },
          { job: vaga('https://x/3', { title: 'Front-end' }), score: 900 },
        ],
        'cargo',
      ),
    ).toEqual(['https://x/2', 'https://x/3', 'https://x/1']);
  });

  it('nunca empata: a URL desempata, e o cursor não pula nem repete', () => {
    const a = sortKey(vaga('https://x/a'), 500, 'empresa');
    const b = sortKey(vaga('https://x/b'), 500, 'empresa');

    expect(a).not.toBe(b);
  });
});
