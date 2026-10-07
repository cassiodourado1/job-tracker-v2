import { fetchPublicJson, fetchPublicPage } from '../../safe-fetch';
import { boardsFor } from '../provider';
import { CompanyPagesSource } from './company-pages';

jest.mock('../../safe-fetch', () => ({
  fetchPublicJson: jest.fn(),
  fetchPublicPage: jest.fn(),
}));

const fetchJson = fetchPublicJson as jest.MockedFunction<
  typeof fetchPublicJson
>;
const fetchPage = fetchPublicPage as jest.MockedFunction<
  typeof fetchPublicPage
>;

/**
 * Respostas SINTÉTICAS, com a forma medida em outubro de 2026: a página de
 * carreira da Gupy embute as vagas em `__NEXT_DATA__`; a InHire responde por
 * API com a empresa no cabeçalho `X-Tenant`. Empresas e ids são inventados.
 */

function paginaGupy(jobs: unknown[], name = 'Acme Tecnologia'): string {
  const data = { props: { pageProps: { careerPage: { name }, jobs } } };

  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
}

function vagaGupy(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Desenvolvedor Front-end Sênior ${id}`,
    type: 'vacancy_type_effective',
    department: 'Tecnologia',
    workplace: {
      workplaceType: 'remote',
      address: { city: 'Salvador', stateShortName: 'BA', country: 'Brasil' },
    },
    ...extra,
  };
}

function vagaInhire(jobId: string, extra: Record<string, unknown> = {}) {
  return {
    jobId,
    displayName: ' Pessoa Desenvolvedora Vue Pleno',
    status: 'published',
    workplaceType: 'Hybrid',
    location: 'São Paulo, SP, BR',
    ...extra,
  };
}

const UUID = '2047f9b7-31e2-4ea6-aca0-1e45909e80c7';

describe('CompanyPagesSource', () => {
  beforeEach(() => {
    fetchJson.mockReset();
    fetchPage.mockReset();
  });

  it('sem empresa acompanhada, não faz requisição nenhuma', async () => {
    await expect(new CompanyPagesSource().fetch({})).resolves.toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('lê todas as vagas da página de carreira da Gupy', async () => {
    fetchPage.mockResolvedValue({
      finalUrl: 'https://acme.gupy.io/',
      html: paginaGupy([
        vagaGupy(1),
        vagaGupy(2, { type: 'vacancy_type_talent_pool' }),
        vagaGupy(3, {
          type: 'vacancy_legal_entity',
          workplace: { workplaceType: 'hybrid' },
        }),
      ]),
    });

    const jobs = await new CompanyPagesSource().fetch({
      companies: [{ platform: 'gupy', slug: 'acme' }],
    });

    expect(fetchPage).toHaveBeenCalledWith('https://acme.gupy.io/');
    expect(jobs.map((job) => job.url)).toEqual([
      'https://acme.gupy.io/jobs/1',
      'https://acme.gupy.io/jobs/3',
    ]);
    expect(jobs[0]).toMatchObject({
      company: 'Acme Tecnologia',
      source: 'empresas',
      workModel: 'remoto',
      contractType: 'clt',
      seniority: 'senior',
      location: 'Salvador, BA, Brasil',
    });
    expect(jobs[1]).toMatchObject({ workModel: 'hibrido', contractType: 'pj' });
  });

  it('lê a InHire pela API, com a empresa no cabeçalho', async () => {
    fetchJson.mockResolvedValue({
      tenantName: 'ACME INOVAÇÃO',
      jobsPage: [vagaInhire(UUID), vagaInhire('outro', { status: 'closed' })],
    });

    const jobs = await new CompanyPagesSource().fetch({
      companies: [{ platform: 'inhire', slug: 'acme' }],
    });

    expect(fetchJson).toHaveBeenCalledWith(
      'https://api.inhire.app/job-posts/public/pages',
      { 'X-Tenant': 'acme', 'X-Inhire-Client': 'web-inhire' },
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      company: 'ACME INOVAÇÃO',
      title: 'Pessoa Desenvolvedora Vue Pleno',
      url: `https://acme.inhire.app/vagas/${UUID}`,
      workModel: 'hibrido',
      seniority: 'pleno',
      location: 'São Paulo, SP, Brasil',
    });
  });

  it('uma empresa que falha não derruba as outras', async () => {
    fetchPage.mockRejectedValue(new Error('404'));
    fetchJson.mockResolvedValue({
      tenantName: 'Acme',
      jobsPage: [vagaInhire(UUID)],
    });

    const jobs = await new CompanyPagesSource().fetch({
      companies: [
        { platform: 'gupy', slug: 'nao-existe' },
        { platform: 'inhire', slug: 'acme' },
      ],
    });

    expect(jobs).toHaveLength(1);
  });

  it('todas falhando, a fonte falha', async () => {
    fetchPage.mockResolvedValue({
      finalUrl: 'x',
      html: '<html>outra coisa</html>',
    });

    await expect(
      new CompanyPagesSource().fetch({
        companies: [{ platform: 'gupy', slug: 'acme' }],
      }),
    ).rejects.toThrow('layout mudou');
  });

  it('ignora plataformas que têm fonte própria', async () => {
    await new CompanyPagesSource().fetch({
      companies: [{ platform: 'greenhouse', slug: 'acme' }],
    });

    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe('boardsFor', () => {
  it('soma o .env com as empresas do perfil daquela plataforma, sem repetir', () => {
    expect(
      boardsFor(
        {
          companies: [
            { platform: 'greenhouse', slug: 'acme' },
            { platform: 'greenhouse', slug: 'beta' },
            { platform: 'lever', slug: 'gama' },
          ],
        },
        'greenhouse',
        ['acme', 'delta'],
      ),
    ).toEqual(['acme', 'delta', 'beta']);
  });
});
