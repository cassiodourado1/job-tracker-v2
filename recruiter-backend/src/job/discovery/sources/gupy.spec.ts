import { fetchPublicPage } from '../../safe-fetch';
import { GupySource, readGupySearchPage } from './gupy';

jest.mock('../../safe-fetch', () => ({ fetchPublicPage: jest.fn() }));

const fetchPage = fetchPublicPage as jest.MockedFunction<
  typeof fetchPublicPage
>;

/**
 * Fixtures SINTÉTICAS, com a forma medida no portal em outubro de 2026:
 * a página de busca embute as vagas em `__NEXT_DATA__`, 12 por página.
 * Empresas e ids são inventados.
 */

function vaga(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `Desenvolvedor Front-end ${id}`,
    description: '<p>Vue, Nuxt e Tailwind.</p>',
    careerPageName: 'Empresa Exemplo',
    type: 'vacancy_type_effective',
    publishedDate: '2026-10-01T12:00:00.000Z',
    workplaceType: 'remote',
    city: 'Salvador',
    state: 'Bahia',
    jobUrl: `https://exemplo.gupy.io/job/${id}`,
    ...extra,
  };
}

function pagina(vagas: unknown[]): string {
  const data = {
    props: {
      pageProps: {
        params: 'term=desenvolvedor',
        initialJobList: {
          data: vagas,
          pagination: { total: vagas.length, limit: 12, offset: 0 },
        },
      },
    },
  };

  return `<html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

function cheia(inicio: number): unknown[] {
  return Array.from({ length: 12 }, (_, i) => vaga(inicio + i));
}

function responde(html: string) {
  return { finalUrl: 'https://portal.gupy.io/job-search', html };
}

describe('readGupySearchPage', () => {
  it('lê as vagas embutidas na página', () => {
    expect(readGupySearchPage(pagina([vaga(1), vaga(2)]))).toHaveLength(2);
  });

  it('distingue busca vazia de layout mudado', () => {
    expect(readGupySearchPage(pagina([]))).toEqual([]);
    expect(
      readGupySearchPage('<html><body>sem dados</body></html>'),
    ).toBeNull();
    expect(
      readGupySearchPage(
        '<script id="__NEXT_DATA__" type="application/json">{quebrado</script>',
      ),
    ).toBeNull();
    expect(
      readGupySearchPage(
        '<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>',
      ),
    ).toBeNull();
  });
});

describe('GupySource', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchPage.mockReset();
  });

  afterEach(() => jest.useRealTimers());

  it('converte a vaga e descarta banco de talentos', async () => {
    fetchPage.mockResolvedValue(
      responde(
        pagina([
          vaga(1),
          vaga(2, { type: 'vacancy_type_talent_pool' }),
          vaga(3, { workplaceType: 'hybrid', type: 'vacancy_legal_entity' }),
        ]),
      ),
    );

    const jobs = await new GupySource().fetch({ q: 'front-end' });

    expect(jobs.map((job) => job.url)).toEqual([
      'https://exemplo.gupy.io/job/1',
      'https://exemplo.gupy.io/job/3',
    ]);
    expect(jobs[0]).toMatchObject({
      source: 'gupy',
      workModel: 'remoto',
      location: 'Salvador, Bahia',
      stack: ['Vue', 'Nuxt', 'Tailwind'],
    });
    expect(jobs[1]).toMatchObject({ workModel: 'hibrido', contractType: 'pj' });
  });

  it('pagina até a página incompleta, com o termo no endereço', async () => {
    fetchPage
      .mockResolvedValueOnce(responde(pagina(cheia(100))))
      .mockResolvedValueOnce(responde(pagina([vaga(200)])));

    const jobs = await new GupySource().fetch({ q: 'front-end' });

    expect(jobs).toHaveLength(13);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(
      1,
      'https://portal.gupy.io/job-search/term=front-end&page=1',
    );
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      'https://portal.gupy.io/job-search/term=front-end&page=2',
    );
  });

  it('para no teto de páginas mesmo com todas cheias', async () => {
    let inicio = 0;
    fetchPage.mockImplementation(() =>
      Promise.resolve(responde(pagina(cheia((inicio += 12))))),
    );

    await new GupySource().fetch({ q: 'front-end' });

    expect(fetchPage).toHaveBeenCalledTimes(5);
  });

  it('um termo que falha não derruba os outros', async () => {
    fetchPage.mockImplementation((url: string) =>
      url.includes('term=backend')
        ? Promise.reject(new Error('timeout'))
        : Promise.resolve(responde(pagina([vaga(url.length)]))),
    );

    const jobs = await new GupySource().fetch({});

    expect(jobs.length).toBeGreaterThan(0);
  });

  it('falha a fonte quando o layout muda', async () => {
    fetchPage.mockResolvedValue(responde('<html>outra coisa</html>'));

    await expect(new GupySource().fetch({})).rejects.toThrow('layout mudou');
  });
});

describe('GupySource com os termos do perfil', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchPage.mockReset();
  });

  afterEach(() => jest.useRealTimers());

  it('busca cada termo do perfil', async () => {
    fetchPage.mockResolvedValue(responde(pagina([])));

    await new GupySource().fetch({ terms: ['front-end', 'drupal'] });

    expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
      'https://portal.gupy.io/job-search/term=front-end&page=1',
      'https://portal.gupy.io/job-search/term=drupal&page=1',
    ]);
  });

  it('nunca passa de três requisições simultâneas', async () => {
    let abertas = 0;
    let pico = 0;

    fetchPage.mockImplementation(async () => {
      abertas += 1;
      pico = Math.max(pico, abertas);
      await new Promise((resolve) => setTimeout(resolve, 5));
      abertas -= 1;

      return responde(pagina([]));
    });

    await new GupySource().fetch({
      terms: ['a', 'b', 'c', 'd', 'e', 'f'],
    });

    expect(fetchPage).toHaveBeenCalledTimes(6);
    expect(pico).toBe(3);
  });
});
