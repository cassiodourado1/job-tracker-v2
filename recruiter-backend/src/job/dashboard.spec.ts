import type { JobSearchResult } from '@recruit/shared';
import { buildDashboard } from './dashboard';

/** Vagas SINTÉTICAS. */
function job(partial: Partial<JobSearchResult>): JobSearchResult {
  return {
    company: 'Empresa A',
    title: 'Dev Front-end',
    url: `https://exemplo.com/${Math.random()}`,
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
    ...partial,
  };
}

// 15/10/2026 12:00 em Brasília.
const NOW = new Date('2026-10-15T15:00:00Z');

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

describe('buildDashboard', () => {
  it('conta só a janela, compara com a anterior e separa as sem data', () => {
    const dashboard = buildDashboard(
      [
        job({ title: 'A', postedAt: hoursAgo(2) }),
        job({ title: 'B', postedAt: hoursAgo(23) }),
        job({ title: 'C', postedAt: hoursAgo(30) }),
        job({ title: 'D', postedAt: hoursAgo(60) }),
        job({ title: 'E', postedAt: null }),
      ],
      '24h',
      NOW,
    );

    expect(dashboard.total).toBe(2);
    expect(dashboard.previousTotal).toBe(1);
    expect(dashboard.undated).toBe(1);
  });

  it('a mesma vaga em dois sites conta uma vez, pela primeira fonte', () => {
    const dashboard = buildDashboard(
      [
        job({ source: 'gupy', postedAt: hoursAgo(1) }),
        job({ source: 'remotar', postedAt: hoursAgo(1) }),
      ],
      '7d',
      NOW,
    );

    expect(dashboard.total).toBe(1);
    expect(dashboard.bySource).toEqual([{ source: 'gupy', count: 1 }]);
  });

  it('agrupa empresa sem caixa e acento, e conta remotas', () => {
    const dashboard = buildDashboard(
      [
        job({
          company: 'Ação Tech',
          title: 'A',
          postedAt: hoursAgo(1),
          workModel: 'remoto',
        }),
        job({
          company: 'ACAO TECH',
          title: 'B',
          postedAt: hoursAgo(5),
          workModel: 'remoto',
        }),
        job({
          company: 'Outra',
          title: 'C',
          postedAt: hoursAgo(5),
          workModel: 'hibrido',
        }),
      ],
      '7d',
      NOW,
    );

    expect(dashboard.companies).toBe(2);
    expect(dashboard.remote).toBe(2);
    expect(dashboard.byCompany).toEqual([
      { company: 'Ação Tech', count: 2 },
      { company: 'Outra', count: 1 },
    ]);
    expect(dashboard.byWorkModel).toEqual([
      { workModel: 'remoto', count: 2 },
      { workModel: 'hibrido', count: 1 },
    ]);
  });

  it('linha do tempo por dia, em Brasília, com os dias vazios', () => {
    const dashboard = buildDashboard(
      [
        // 15/10 01:00 em Brasília (04:00 UTC): conta no dia 15, não no 14.
        job({ title: 'A', postedAt: '2026-10-15T04:00:00Z', source: 'gupy' }),
        // 15/10 02:00 UTC é 14/10 23:00 em Brasília.
        job({ title: 'B', postedAt: '2026-10-15T02:00:00Z', source: 'nerdin' }),
      ],
      '7d',
      NOW,
    );

    expect(dashboard.timeline).toHaveLength(7);
    expect(dashboard.timeline[0].key).toBe('2026-10-09');
    expect(dashboard.timeline.at(-1)).toEqual({
      key: '2026-10-15',
      total: 1,
      bySource: { gupy: 1 },
    });
    expect(dashboard.timeline.at(-2)).toEqual({
      key: '2026-10-14',
      total: 1,
      bySource: { nerdin: 1 },
    });
  });

  it('na janela de 24h, uma barra por hora', () => {
    const dashboard = buildDashboard([], '24h', NOW);

    expect(dashboard.timeline).toHaveLength(24);
    expect(dashboard.timeline.at(-1)?.key).toBe('2026-10-15T12');
  });
});
