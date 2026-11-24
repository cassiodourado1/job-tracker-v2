import { FetchError, fetchPublicJson } from '../../safe-fetch';
import { paramsFor, RebaseJobsSource, toResult } from './rebase';

jest.mock('../../safe-fetch', () => ({
  ...jest.requireActual<typeof import('../../safe-fetch')>('../../safe-fetch'),
  fetchPublicJson: jest.fn(),
}));

const fetchJson = jest.mocked(fetchPublicJson);
/** Token SINTÉTICO: o teste confere que ele nunca aparece num erro. */
const TOKEN = 'token-sintetico-123';

const job = (overrides: Record<string, unknown> = {}) => ({
  title: 'Senior Frontend Developer',
  company: { name: 'Exemplo' },
  location: 'Brasil',
  hires_in_brazil: 'yes',
  remote: null,
  work_mode: null,
  remoto_comprovado: true,
  seniority: 'sênior',
  skills: ['react', 'typescript'],
  hiring_models: ['clt'],
  salary_min: 8000,
  salary_max: 12000,
  salary_currency: 'BRL',
  published_at: '2026-11-20T12:00:00.000Z',
  apply_url: 'https://jobs.example.com/frontend',
  url: 'https://rebasedev.com.br/jobs/frontend',
  description: '<p>Construir interfaces com React.</p>',
  closed_at: null,
  ...overrides,
});

describe('Rebase Jobs source', () => {
  it('usa as skills compatíveis do perfil em uma busca OR', () => {
    const params = paramsFor({ terms: ['React.js', 'TypeScript', 'Drupal'] });

    expect(params.getAll('skill')).toEqual(['react', 'typescript']);
    expect(params.get('skills_modo')).toBe('ou');
    expect(params.get('por_pagina')).toBe('50');
  });

  it('preserva o texto digitado como busca e limita seu tamanho', () => {
    const params = paramsFor({ q: 'Angular remoto' });

    expect(params.get('q')).toBe('Angular remoto');
    expect(params.has('skill')).toBe(false);
  });

  it('converte os campos publicados para o contrato do app', () => {
    expect(toResult(job())).toMatchObject({
      company: 'Exemplo',
      title: 'Senior Frontend Developer',
      source: 'rebase',
      description: 'Construir interfaces com React.',
      seniority: 'senior',
      workModel: 'remoto',
      contractType: 'clt',
      location: 'Brasil',
      salaryMin: 8000,
      salaryMax: 12000,
      salaryCurrency: 'BRL',
      postedAt: '2026-11-20T12:00:00.000Z',
    });
  });

  it('ignora vaga encerrada ou fora do Brasil', () => {
    expect(toResult(job({ closed_at: '2026-11-22T00:00:00.000Z' }))).toBeNull();
    expect(toResult(job({ hires_in_brazil: 'no' }))).toBeNull();
  });

  it('não inventa modalidade quando a API não comprova remoto', () => {
    expect(
      toResult(job({ remoto_comprovado: false, remote: null, work_mode: null }))
        ?.workModel,
    ).toBeNull();
  });

  it('manda o token só no cabeçalho, nunca na URL', async () => {
    fetchJson.mockResolvedValueOnce({ data: [job()], meta: {} });

    const jobs = await new RebaseJobsSource(TOKEN).fetch({ terms: ['React'] });

    const [url, headers] = fetchJson.mock.calls[0];
    expect(url).not.toContain(TOKEN);
    expect(headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(jobs).toHaveLength(1);
  });

  it.each(['401', '403'])(
    'token recusado (%s) vira erro que nomeia a variável, sem o token',
    async (status) => {
      fetchJson.mockRejectedValueOnce(
        new FetchError(`A página respondeu ${status}.`),
      );

      const error = await new RebaseJobsSource(TOKEN)
        .fetch({ terms: ['React'] })
        .catch((e: Error) => e);

      expect((error as Error).message).toContain('REBASE_JOBS_TOKEN');
      expect((error as Error).message).not.toContain(TOKEN);
    },
  );

  it('falha de conexão aparece sem o token', async () => {
    fetchJson.mockRejectedValueOnce(
      new FetchError('Não consegui acessar a página.'),
    );

    const error = await new RebaseJobsSource(TOKEN)
      .fetch({ terms: ['React'] })
      .catch((e: Error) => e);

    expect((error as Error).message).toMatch(/Rebase Jobs falhou/);
    expect((error as Error).message).not.toContain(TOKEN);
  });
});
