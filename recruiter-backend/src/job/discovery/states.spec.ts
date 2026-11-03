import type { JobSearchResult } from '@recruit/shared';
import { statesFromText } from './normalize';
import { countByState, inState } from './states';

/**
 * Os formatos abaixo são os que a descoberta devolve de verdade, medidos numa
 * rodada com 914 localizações: sigla, nome por extenso, várias cidades na
 * mesma vaga, e a maioria sem estado nenhum.
 */
describe('statesFromText', () => {
  it.each([
    ['Curitiba, PR', ['PR']],
    ['São Paulo, SP, Brasil', ['SP']],
    ['São Paulo, SP, SP, BRA', ['SP']],
    ['Porto Alegre, Rio Grande do Sul', ['RS']],
    ['Florianopolis, Santa Catarina, Brasil', ['SC']],
    ['Brasília, Distrito Federal', ['DF']],
    ['Vila Velha, Espírito Santo', ['ES']],
    ['Sp, São Paulo', ['SP']],
    ['SAO PAULO, SP, Brazil', ['SP']],
    [
      'Belo Horizonte, MG; Curitiba, PR; Recife, PE; São Paulo, SP',
      ['MG', 'PR', 'PE', 'SP'],
    ],
    ['São Paulo / Rio de Janeiro', ['SP', 'RJ']],
    ['GOIÂNIA, Brasil', ['GO']],
    ['Greater São Paulo Area', ['SP']],
    ['São Paulo e Região', ['SP']],
  ])('%s → %j', (location, expected) => {
    expect(statesFromText(location)).toEqual(expected);
  });

  it.each([
    ['Brasil'],
    ['Brazil, BR'],
    ['BR'],
    ['Remoto'],
    // "Porto" é cidade portuguesa, mas aqui o texto diz Brasil: sem estado.
    ['Porto, Porto, Brasil'],
  ])('%s não diz o estado', (location) => {
    expect(statesFromText(location)).toEqual([]);
  });

  it.each([
    // Siglas que colidem com estados americanos e com países.
    ['Boston, MA'],
    ['Colombia, CO'],
    ['Palo Alto, United States'],
    ['Toronto, Canada'],
    ['San Salvador'],
  ])('%s é de fora', (location) => {
    expect(statesFromText(location)).toEqual([]);
  });

  it('vazio não tem estado', () => {
    expect(statesFromText(null)).toEqual([]);
  });

  it('a sigla escrita vence a cidade', () => {
    expect(statesFromText('Campinas, MG')).toEqual(['MG']);
  });
});

function job(
  title: string,
  location: string | null,
  company = 'Empresa Exemplo',
): JobSearchResult {
  return {
    title,
    company,
    location,
    url: `https://example.com/${encodeURIComponent(`${title}-${location}`)}`,
    source: 'gupy',
    workModel: null,
    contractType: null,
    seniority: null,
    stack: [],
    postedAt: null,
    description: null,
  } as unknown as JobSearchResult;
}

describe('inState', () => {
  const jobs = [
    job('Dev Front-end', 'São Paulo, SP'),
    job('Dev Back-end', 'Curitiba, PR'),
    job('Dev Mobile', 'Brasil'),
    // Mesma vaga anunciada em dois estados: é uma vaga só, nos dois.
    job('Dev Pleno', 'Recife, PE'),
    job('Dev Pleno', 'Rio de Janeiro, RJ'),
  ];

  it('sem estado escolhido não corta nada', () => {
    expect(inState(jobs, [])).toHaveLength(5);
  });

  it('deixa só as vagas do estado', () => {
    expect(inState(jobs, ['SP']).map((item) => item.title)).toEqual([
      'Dev Front-end',
    ]);
  });

  it('vaga sem estado some ao escolher um estado', () => {
    expect(inState(jobs, ['PR']).map((item) => item.location)).toEqual([
      'Curitiba, PR',
    ]);
  });

  it('a vaga anunciada em dois estados aparece nos dois, com os anúncios juntos', () => {
    expect(inState(jobs, ['RJ']).map((item) => item.location)).toEqual([
      'Recife, PE',
      'Rio de Janeiro, RJ',
    ]);
  });

  it('vários estados combinam por "ou"', () => {
    expect(inState(jobs, ['SP', 'PR']).map((item) => item.title)).toEqual([
      'Dev Front-end',
      'Dev Back-end',
    ]);
  });

  it('nao-informa junto de um estado traz os dois grupos', () => {
    expect(
      inState(jobs, ['SP', 'nao-informa']).map((item) => item.title),
    ).toEqual(['Dev Front-end', 'Dev Mobile']);
  });

  it('nao-informa traz só as vagas sem estado', () => {
    expect(inState(jobs, ['nao-informa']).map((item) => item.title)).toEqual([
      'Dev Mobile',
    ]);
  });
});

describe('countByState', () => {
  it('ordena pela quantidade e deixa "não informa" no fim', () => {
    const jobs = [
      job('A', 'São Paulo, SP'),
      job('B', 'Campinas, SP'),
      job('C', 'Curitiba, PR'),
      job('D', 'Brasil'),
      job('E', null),
      job('F', 'Remoto'),
      job('G', 'Belo Horizonte, MG'),
    ];

    expect(countByState(jobs)).toEqual([
      { state: 'SP', count: 2 },
      { state: 'MG', count: 1 },
      { state: 'PR', count: 1 },
      { state: 'nao-informa', count: 3 },
    ]);
  });

  it('anúncios repetidos contam uma vez, como o total', () => {
    const jobs = [
      job('Dev Pleno', 'São Paulo, SP'),
      job('Dev Pleno', 'Osasco, SP'),
    ];

    expect(countByState(jobs)).toEqual([{ state: 'SP', count: 1 }]);
  });

  it('sem vaga sem estado, não inventa a linha', () => {
    expect(countByState([job('A', 'Recife, PE')])).toEqual([
      { state: 'PE', count: 1 },
    ]);
  });
});
