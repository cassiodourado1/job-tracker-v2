import type { JobSearchResult } from '@recruit/shared';
import { groupSameJob } from './grouping';

function vaga(
  url: string,
  company: string,
  title: string,
  extra: Partial<JobSearchResult> = {},
): { job: JobSearchResult; key: string } {
  return {
    key: url,
    job: {
      company,
      title,
      url,
      source: 'gupy',
      description: null,
      stack: [],
      requirements: [],
      benefits: [],
      seniority: null,
      workModel: 'remoto',
      contractType: null,
      location: 'Brasil',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      weeklyHours: null,
      postedAt: null,
      ...extra,
    },
  };
}

describe('groupSameJob', () => {
  it('junta anúncios da mesma empresa e do mesmo título no primeiro', () => {
    const grouped = groupSameJob([
      vaga(
        'https://a.gupy.io/jobs/1',
        'Banco Exemplo',
        'Engenheiro Sr. (Java)',
      ),
      vaga('https://b.example/x', 'Outra', 'Front-end'),
      vaga(
        'https://a.gupy.io/jobs/2',
        'Banco Exemplo',
        'Engenheiro Sr. (Java)',
        {
          location: 'São Paulo, Brasil',
          workModel: 'hibrido',
        },
      ),
    ]);

    expect(grouped.map(({ job }) => job.url)).toEqual([
      'https://a.gupy.io/jobs/1',
      'https://b.example/x',
    ]);
    expect(grouped[0].key).toBe('https://a.gupy.io/jobs/1');
    expect(grouped[0].job.others).toEqual([
      {
        url: 'https://a.gupy.io/jobs/2',
        source: 'gupy',
        location: 'São Paulo, Brasil',
        workModel: 'hibrido',
        postedAt: null,
      },
    ]);
    expect(grouped[1].job.others).toEqual([]);
  });

  it('ignora acento, caixa e espaço sobrando, e junta entre fontes', () => {
    const grouped = groupSameJob([
      vaga('https://x/1', 'Empresa Ágil', 'Desenvolvedor  Front-End Sênior'),
      vaga('https://y/2', 'empresa agil', 'desenvolvedor front-end senior', {
        source: 'remotar',
      }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].job.others[0].source).toBe('remotar');
  });

  it('título diferente na mesma empresa continua separado', () => {
    expect(
      groupSameJob([
        vaga('https://x/1', 'Empresa', 'Engenheiro Sr. (Java)'),
        vaga('https://x/2', 'Empresa', 'Engenheiro Pl. (Java)'),
      ]),
    ).toHaveLength(2);
  });

  it('não altera as entradas recebidas', () => {
    const entrada = [
      vaga('https://x/1', 'E', 'T'),
      vaga('https://x/2', 'E', 'T'),
    ];

    groupSameJob(entrada);

    expect(entrada[0].job).not.toHaveProperty('others');
  });
});
