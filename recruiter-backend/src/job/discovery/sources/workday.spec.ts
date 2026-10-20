import { fetchPublicJson } from '../../safe-fetch';
import {
  postedOnToIso,
  readWorkdayCompany,
  workdayCompanyName,
} from './company-pages';

jest.mock('../../safe-fetch', () => ({
  fetchPublicJson: jest.fn(),
  fetchPublicPage: jest.fn(),
}));

const fetchJson = fetchPublicJson as jest.MockedFunction<
  typeof fetchPublicJson
>;

/**
 * Respostas SINTÉTICAS, com a forma medida em outubro de 2026: a lista traz
 * título, caminho, local e "Posted N Days Ago"; os filtros vêm aninhados, com
 * o país dentro do grupo de localização. Empresa e ids são inventados.
 */
const FACETS = [
  {
    facetParameter: 'locationMainGroup',
    values: [
      {
        facetParameter: 'locationCountry',
        descriptor: 'Country',
        values: [
          { descriptor: 'India', id: 'pais-in' },
          { descriptor: 'Brazil', id: 'pais-br' },
        ],
      },
    ],
  },
];

function vaga(n: number, extra: Record<string, unknown> = {}) {
  return {
    title: `Desenvolvedor(a) Java ${n}`,
    externalPath: `/job/Sao-Paulo/Desenvolvedor-Java_R${n}`,
    locationsText: 'Sao Paulo',
    postedOn: 'Posted 2 Days Ago',
    ...extra,
  };
}

const NOW = new Date('2026-10-20T12:00:00Z');
const noDelay = () => Promise.resolve();

describe('readWorkdayCompany', () => {
  beforeEach(() => fetchJson.mockReset());

  it('acha o Brasil nos filtros e lê só as vagas dele, por POST', async () => {
    fetchJson
      .mockResolvedValueOnce({ total: 2000, jobPostings: [], facets: FACETS })
      .mockResolvedValueOnce({
        total: 2,
        jobPostings: [vaga(1), vaga(2, { locationsText: '2 Locations' })],
      });

    const jobs = await readWorkdayCompany('acme.wd5/AcmeCareers', NOW, noDelay);

    const [, , filtered] = fetchJson.mock.calls[1];

    expect(fetchJson.mock.calls[1][0]).toBe(
      'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/AcmeCareers/jobs',
    );
    expect(filtered).toMatchObject({
      appliedFacets: { locationCountry: ['pais-br'] },
      offset: 0,
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      company: 'Acme',
      url: 'https://acme.wd5.myworkdayjobs.com/AcmeCareers/job/Sao-Paulo/Desenvolvedor-Java_R1',
      location: 'Sao Paulo, Brasil',
      source: 'empresas',
      postedAt: '2026-10-18T12:00:00.000Z',
    });
    expect(jobs[1].location).toBe('Brasil');
  });

  it('empresa sem vaga no Brasil não lê nada e não é erro', async () => {
    fetchJson.mockResolvedValueOnce({
      total: 10,
      jobPostings: [],
      facets: [
        {
          facetParameter: 'locationMainGroup',
          values: [
            {
              facetParameter: 'locationCountry',
              values: [{ descriptor: 'India', id: 'pais-in' }],
            },
          ],
        },
      ],
    });

    await expect(
      readWorkdayCompany('acme.wd5/AcmeCareers', NOW, noDelay),
    ).resolves.toEqual([]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('para de paginar quando a página vem incompleta', async () => {
    fetchJson
      .mockResolvedValueOnce({ total: 500, jobPostings: [], facets: FACETS })
      .mockResolvedValueOnce({
        total: 500,
        jobPostings: Array.from({ length: 20 }, (_, i) => vaga(i)),
      })
      .mockResolvedValueOnce({ total: 500, jobPostings: [vaga(99)] });

    const jobs = await readWorkdayCompany('acme.wd5/AcmeCareers', NOW, noDelay);

    expect(jobs).toHaveLength(21);
    expect(fetchJson).toHaveBeenCalledTimes(3);
  });

  it('identificador fora do formato é erro', async () => {
    await expect(readWorkdayCompany('acme', NOW, noDelay)).rejects.toThrow(
      'inválido',
    );
  });
});

describe('postedOnToIso', () => {
  it.each([
    ['Posted Today', '2026-10-20T12:00:00.000Z'],
    ['Posted Yesterday', '2026-10-19T12:00:00.000Z'],
    ['Posted 5 Days Ago', '2026-10-15T12:00:00.000Z'],
    ['Posted 30+ Days Ago', null],
    [null, null],
  ])('%s → %s', (label, expected) => {
    expect(postedOnToIso(label, NOW)).toBe(expected);
  });
});

describe('workdayCompanyName', () => {
  it.each([
    ['AccentureCareers', 'accenture', 'Accenture'],
    ['AvanadeCareers', 'accenture', 'Avanade'],
    ['External', 'acme', 'Acme'],
    ['Careers', 'acme', 'Acme'],
  ])('%s → %s', (site, tenant, expected) => {
    expect(workdayCompanyName(site, tenant)).toBe(expected);
  });
});

describe('readWorkdayCompany com limite da Workday', () => {
  beforeEach(() => fetchJson.mockReset());

  it('429 no meio da leitura fica com as páginas já lidas', async () => {
    fetchJson
      .mockResolvedValueOnce({ total: 500, jobPostings: [], facets: FACETS })
      .mockResolvedValueOnce({
        total: 500,
        jobPostings: Array.from({ length: 20 }, (_, i) => vaga(i)),
      })
      .mockRejectedValueOnce(new Error('A página respondeu 429.'));

    await expect(
      readWorkdayCompany('acme.wd5/AcmeCareers', NOW, noDelay),
    ).resolves.toHaveLength(20);
  });
});
