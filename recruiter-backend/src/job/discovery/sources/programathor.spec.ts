import { fetchPublicPage } from '../../safe-fetch';
import {
  cardToResult,
  ProgramathorSource,
  readProgramathorCards,
  salaryFromLabel,
} from './programathor';

jest.mock('../../safe-fetch', () => ({ fetchPublicPage: jest.fn() }));

const fetchPage = fetchPublicPage as jest.MockedFunction<
  typeof fetchPublicPage
>;

/**
 * Cards SINTÉTICOS, com a marcação medida na listagem em outubro de 2026:
 * campos identificados pelo ícone, selos dentro do <h3>, tecnologias em
 * `tag-list`. Empresas e ids são inventados.
 */

function campo(icone: string, valor: string): string {
  return `<span><i class='${icone}'></i>${valor}</span>`;
}

function card(opcoes: {
  id: number;
  titulo: string;
  vencida?: boolean;
  presencialSomente?: boolean;
  local?: string;
  salario?: string;
  senioridade?: string;
  contrato?: string;
  tags?: string[];
}): string {
  const selos = [
    opcoes.presencialSomente
      ? '<span class="presential-only-badge text-14">📍 PRESENCIAL - SOMENTE PARA CANDIDATOS NO LOCAL</span> '
      : '',
    opcoes.vencida
      ? '<span class="text-16 border-red color-red">Vencida</span> '
      : '',
  ].join('');

  return `
    <div class="cell-list ">
      <a href="/jobs/${opcoes.id}-vaga-${opcoes.id}">
        <div class="row"><div class="col-sm-9"><div class="cell-list-content">
          <h3 class="text-24 line-height-30">${selos}${opcoes.titulo}</h3>
          <div class='cell-list-content-icon'>
            ${campo('fa fa-briefcase', 'Empresa Exemplo')}
            ${campo('fas fa-map-marker-alt', opcoes.local ?? 'Remoto')}
            ${campo('fa fa-building', 'Pequena/média empresa')}
            ${opcoes.salario ? campo('far fa-money-bill-alt', opcoes.salario) : ''}
            ${campo('far fa-chart-bar', opcoes.senioridade ?? 'Sênior')}
            ${campo('far fa-file-alt', opcoes.contrato ?? 'PJ')}
            ${campo('fas fa-plane', 'Aceito candidatos de outras cidades')}
          </div>
          <div>${(opcoes.tags ?? ['Vue.js', 'Nuxt', 'TypeScript'])
            .map(
              (tag) => `<span class='tag-list background-gray'>${tag}</span>`,
            )
            .join('')}</div>
        </div></div></div>
      </a>
    </div>`;
}

function pagina(...cards: string[]): string {
  return `<html><body><div class="container">${cards.join('')}</div></body></html>`;
}

function responde(html: string) {
  return { finalUrl: 'https://programathor.com.br/jobs', html };
}

describe('readProgramathorCards', () => {
  it('lê os campos pelo ícone e separa os selos do título', () => {
    const [lido] = readProgramathorCards(
      pagina(
        card({
          id: 1,
          titulo: 'Desenvolvedor(a) Front-End Sênior',
          presencialSomente: true,
          salario: 'Até R$18.000',
        }),
      ),
    );

    expect(lido).toMatchObject({
      path: '/jobs/1-vaga-1',
      title: 'Desenvolvedor(a) Front-End Sênior',
      expired: false,
      fields: {
        company: 'Empresa Exemplo',
        location: 'Remoto',
        salary: 'Até R$18.000',
        seniority: 'Sênior',
        contract: 'PJ',
      },
      tags: ['Vue.js', 'Nuxt', 'TypeScript'],
    });
  });

  it('marca a vencida', () => {
    const [lido] = readProgramathorCards(
      pagina(card({ id: 1, titulo: 'Front-end', vencida: true })),
    );

    expect(lido.expired).toBe(true);
    expect(lido.title).toBe('Front-end');
  });
});

describe('cardToResult', () => {
  function converte(opcoes: Parameters<typeof card>[0]) {
    return cardToResult(readProgramathorCards(pagina(card(opcoes)))[0]);
  }

  it('converte o card inteiro', () => {
    const job = converte({
      id: 7,
      titulo: 'Desenvolvedor(a) Front-End Pleno',
      senioridade: 'Pleno',
      contrato: 'CLT',
      salario: 'Até R$12.000',
    });

    expect(job).toMatchObject({
      company: 'Empresa Exemplo',
      url: 'https://programathor.com.br/jobs/7-vaga-7',
      source: 'programathor',
      workModel: 'remoto',
      seniority: 'pleno',
      contractType: 'clt',
      location: 'Brasil',
      salaryMin: null,
      salaryMax: 12000,
      salaryCurrency: 'BRL',
    });
    expect(job?.stack).toEqual(
      expect.arrayContaining<string>(['Vue', 'Nuxt', 'TypeScript']),
    );
  });

  it('não repete o país quando o card já traz', () => {
    expect(
      converte({
        id: 1,
        titulo: 'Front',
        local: 'Novo Hamburgo, Rio Grande do Sul, Brasil (Presencial)',
      })?.location,
    ).toBe('Novo Hamburgo, Rio Grande do Sul, Brasil');
  });

  it('lê modalidade e cidade do local', () => {
    expect(
      converte({ id: 1, titulo: 'Front', local: 'São Paulo/SP (Híbrido)' }),
    ).toMatchObject({ workModel: 'hibrido', location: 'São Paulo/SP, Brasil' });
    expect(
      converte({ id: 1, titulo: 'Front', local: 'GOIÂNIA (Presencial)' }),
    ).toMatchObject({ workModel: 'presencial', location: 'GOIÂNIA, Brasil' });
  });

  it('"CLT / PJ" aceita os dois e não escolhe um', () => {
    expect(
      converte({ id: 1, titulo: 'Front', contrato: 'CLT / PJ' })?.contractType,
    ).toBeNull();
  });

  it('sem salário no card, sem moeda', () => {
    expect(converte({ id: 1, titulo: 'Front' })).toMatchObject({
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
    });
  });
});

describe('salaryFromLabel', () => {
  it.each([
    ['Até R$18.000', { min: null, max: 18000 }],
    ['A partir de R$8.000', { min: 8000, max: null }],
    ['R$6.000 a R$9.000', { min: 6000, max: 9000 }],
    ['R$ 7.500,00', { min: 7500, max: 7500 }],
    ['A combinar', { min: null, max: null }],
    ['Até R$0', { min: null, max: null }],
    [null, { min: null, max: null }],
  ])('%s', (label, expected) => {
    expect(salaryFromLabel(label)).toEqual(expected);
  });
});

describe('ProgramathorSource', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchPage.mockReset();
  });

  afterEach(() => jest.useRealTimers());

  it('descarta vencidas e para na primeira página sem vaga aberta', async () => {
    fetchPage
      .mockResolvedValueOnce(
        responde(
          pagina(
            card({ id: 1, titulo: 'Front A' }),
            card({ id: 2, titulo: 'Front B', vencida: true }),
          ),
        ),
      )
      .mockResolvedValueOnce(
        responde(pagina(card({ id: 3, titulo: 'Front C', vencida: true }))),
      );

    const jobs = await new ProgramathorSource().fetch();

    expect(jobs.map((job) => job.title)).toEqual(['Front A']);
    expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
      'https://programathor.com.br/jobs',
      'https://programathor.com.br/jobs/page/2',
    ]);
  });

  it('falha a fonte quando a primeira página não tem card nenhum', async () => {
    fetchPage.mockResolvedValue(responde('<html>outra coisa</html>'));

    await expect(new ProgramathorSource().fetch()).rejects.toThrow(
      'layout mudou',
    );
  });
});
