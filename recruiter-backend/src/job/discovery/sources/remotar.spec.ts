import { fetchPublicJson } from '../../safe-fetch';
import { canonicalJobUrl } from '../canonical-url';
import { RemotarSource, toResult } from './remotar';

jest.mock('../../safe-fetch', () => ({ fetchPublicJson: jest.fn() }));

const fetchJson = fetchPublicJson as jest.MockedFunction<
  typeof fetchPublicJson
>;

/**
 * Fixtures SINTÉTICAS, com a forma medida na API em outubro de 2026. As tags
 * vêm com emoji, como no portal. Empresas e ids são inventados.
 */

function tag(name: string) {
  return { tag: { name } };
}

function vaga(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Pessoa Desenvolvedora Front-End ${id}`,
    subtitle: 'Front-end com foco em Vue e Nuxt',
    description: '<p>Experiência com Vue, Nuxt e Tailwind.</p>',
    type: 'remote',
    city: null,
    state: null,
    active: true,
    expired: false,
    externalLink: `https://acme.inhire.app/vagas/${id}/dev-front`,
    createdAt: '2026-10-06T22:01:21.977-03:00',
    companyDisplayName: null,
    company: { name: 'Empresa Exemplo' },
    jobTags: [tag('🌍 100% Remoto'), tag('🧓🏽 Sênior'), tag('💼 CLT')],
    jobRequirements: [{ description: 'Experiência com Vue' }],
    jobBenefits: [{ description: 'Plano de saúde' }],
    jobSalary: { from: 0, to: 0, currency: 'BRL', type: 'monthly' },
    ...extra,
  };
}

function pagina(data: unknown[], lastPage = 1) {
  return { meta: { last_page: lastPage }, data };
}

describe('toResult', () => {
  it('converte a vaga com as tags do portal', () => {
    expect(toResult(vaga(1))).toMatchObject({
      company: 'Empresa Exemplo',
      url: 'https://acme.inhire.app/vagas/1/dev-front',
      source: 'remotar',
      workModel: 'remoto',
      seniority: 'senior',
      contractType: 'clt',
      location: 'Brasil',
      requirements: ['Experiência com Vue'],
      benefits: ['Plano de saúde'],
      stack: ['Vue', 'Nuxt', 'Tailwind'],
    });
  });

  it('não usa o salário, que vem com valores que não fecham', () => {
    const job = toResult(
      vaga(1, {
        jobSalary: {
          from: 900000,
          to: 1200000,
          currency: 'USD',
          type: 'monthly',
        },
      }),
    );

    expect(job).toMatchObject({
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
    });
  });

  it('descarta vaga encerrada', () => {
    expect(toResult(vaga(1, { expired: true }))).toBeNull();
    expect(toResult(vaga(1, { active: false }))).toBeNull();
  });

  it('CLT e PJ juntos não escolhem um dos dois', () => {
    expect(
      toResult(vaga(1, { jobTags: [tag('💼 CLT'), tag('🤝🏽 PJ')] }))
        ?.contractType,
    ).toBeNull();
    expect(toResult(vaga(1, { jobTags: [tag('🤝🏽 PJ')] }))?.contractType).toBe(
      'pj',
    );
  });

  it('vaga internacional fica sem localização em vez de virar Brasil', () => {
    expect(
      toResult(vaga(1, { jobTags: [tag('✈️ Vaga internacional')] }))?.location,
    ).toBeNull();
    expect(
      toResult(
        vaga(1, { jobTags: [tag('💵  Pagamento em moeda estrangeira')] }),
      )?.location,
    ).toBeNull();
    expect(toResult(vaga(1, { city: 'Salvador', state: 'BA' }))?.location).toBe(
      'Salvador, BA, Brasil',
    );
  });

  it('sem tag de senioridade, deduz do título', () => {
    expect(
      toResult(vaga(1, { jobTags: [], title: 'Desenvolvedor Pleno Vue' }))
        ?.seniority,
    ).toBe('pleno');
  });

  it('híbrido vem do campo próprio', () => {
    expect(toResult(vaga(1, { type: 'hybrid' }))?.workModel).toBe('hibrido');
  });

  /**
   * O caso que motivou a regra da Gupy em `canonicalJobUrl`: a Remotar
   * repassa vaga da Gupy com um token de canal próprio.
   */
  it('vaga da Gupy repassada pela Remotar tem a mesma URL que pela Gupy', () => {
    const token = (source: string) =>
      Buffer.from(JSON.stringify({ jobId: 7654321, source })).toString(
        'base64',
      );

    const viaRemotar = toResult(
      vaga(1, {
        externalLink: `https://acme.gupy.io/job/${token('remotar')}?jobBoardSource=remotar`,
      }),
    );

    expect(viaRemotar?.url).toBe(
      canonicalJobUrl(
        `https://acme.gupy.io/job/${token('gupy_portal')}?jobBoardSource=gupy_portal`,
      ),
    );
    expect(viaRemotar?.url).toBe('https://acme.gupy.io/jobs/7654321');
  });
});

describe('RemotarSource', () => {
  beforeEach(() => fetchJson.mockReset());

  it('busca cada termo do perfil e pagina até a última página', async () => {
    fetchJson.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('page=1')
          ? pagina([vaga(url.length)], 2)
          : pagina([vaga(url.length + 1000)], 2),
      ),
    );

    const jobs = await new RemotarSource().fetch({ terms: ['front-end'] });

    expect(fetchJson.mock.calls.map(([url]) => url)).toEqual([
      'https://api.remotar.com.br/jobs?search=front-end&limit=50&page=1',
      'https://api.remotar.com.br/jobs?search=front-end&limit=50&page=2',
    ]);
    expect(jobs).toHaveLength(2);
  });

  it('a mesma vaga achada por dois termos aparece uma vez', async () => {
    fetchJson.mockResolvedValue(pagina([vaga(1)]));

    const jobs = await new RemotarSource().fetch({
      terms: ['front-end', 'vue'],
    });

    expect(jobs).toHaveLength(1);
  });

  it('falha a fonte quando a resposta muda de forma', async () => {
    fetchJson.mockResolvedValue({ outra: 'coisa' });

    await expect(new RemotarSource().fetch({})).rejects.toThrow('a API mudou');
  });
});
