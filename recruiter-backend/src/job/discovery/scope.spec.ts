import {
  defaultJobPreferences,
  type JobPreferences,
  type JobSearchResult,
} from '@recruit/shared';
import { matches } from './filters';

/**
 * O filtro de escopo, pelo caminho que a descoberta realmente usa.
 *
 * Separado de `normalize.spec.ts` de propósito: aquele prova que a localização
 * é reconhecida, este prova que reconhecê-la **mantém a vaga**. Eram duas
 * falhas independentes, e só a segunda fazia a vaga sumir.
 */

function preferences(over: Partial<JobPreferences> = {}): JobPreferences {
  return {
    scope: null,
    workModels: [],
    contractTypes: [],
    seniorities: [],
    stacks: [],
    titleIncludes: [],
    titleExcludes: [],
    linkedinMaxAgeDays: 14,
    hideUndeclaredWorkModel: false,
    searchTerms: ['desenvolvedor'],
    companyPages: [],
    ...over,
  };
}

function job(location: string | null): JobSearchResult {
  return {
    company: 'Acme',
    title: 'Desenvolvedor Back-end Node.js',
    url: 'https://www.linkedin.com/jobs/view/1',
    source: 'linkedin-alerts',
    description: null,
    stack: [],
    requirements: [],
    benefits: [],
    seniority: null,
    workModel: null,
    contractType: null,
    location,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    weeklyHours: null,
    postedAt: null,
  };
}

describe('escopo Brasil', () => {
  const brasil = preferences({ scope: 'brasil' });

  it.each([
    ['Salvador, BA'],
    ['São Paulo, SP'],
    ['Porto Alegre, RS'],
    ['São Paulo e Região'],
    ['Brasil'],
  ])('mantém a vaga em %s', (local) => {
    // Antes da correção, quatro destas cinco eram descartadas: qualquer
    // localização não nula sem a palavra "brasil" era tratada como
    // definitivamente estrangeira.
    expect(matches(job(local), brasil)).toBe(true);
  });

  it('descarta vaga estrangeira', () => {
    expect(matches(job('Boston, MA'), brasil)).toBe(false);
    expect(matches(job('Lisboa'), brasil)).toBe(false);
  });

  it('localização desconhecida passa', () => {
    // "Não sei onde é" não pode virar "não é aqui".
    expect(matches(job('Kraków'), brasil)).toBe(true);
    expect(matches(job(null), brasil)).toBe(true);
  });
});

describe('escopo internacional', () => {
  const fora = preferences({ scope: 'internacional' });

  it('mantém estrangeira e descarta brasileira', () => {
    expect(matches(job('Boston, MA'), fora)).toBe(true);
    expect(matches(job('Salvador, BA'), fora)).toBe(false);
    expect(matches(job('Porto Alegre, RS'), fora)).toBe(false);
  });

  it('localização desconhecida continua passando', () => {
    expect(matches(job('Kraków'), fora)).toBe(true);
  });
});

describe('sem escopo escolhido', () => {
  it('passa tudo', () => {
    const qualquer = preferences({ scope: null });

    expect(matches(job('Salvador, BA'), qualquer)).toBe(true);
    expect(matches(job('Boston, MA'), qualquer)).toBe(true);
  });
});

describe('idade das vagas de alerta do LinkedIn', () => {
  const HOJE = new Date('2026-10-06T12:00:00Z');
  const diasAtras = (dias: number) =>
    new Date(HOJE.getTime() - dias * 86_400_000).toISOString();
  const vaga = (postedAt: string | null, source = 'linkedin-alerts') => ({
    ...job(null),
    postedAt,
    source,
  });

  it('corta a vaga mais velha que o limite', () => {
    expect(matches(vaga(diasAtras(20)), preferences(), HOJE)).toBe(false);
  });

  it('mantém a vaga dentro do limite', () => {
    expect(matches(vaga(diasAtras(10)), preferences(), HOJE)).toBe(true);
  });

  it('respeita o limite escolhido no perfil', () => {
    expect(
      matches(
        vaga(diasAtras(20)),
        preferences({ linkedinMaxAgeDays: 30 }),
        HOJE,
      ),
    ).toBe(true);
  });

  it('só vale para o LinkedIn: as outras fontes trazem vaga aberta', () => {
    expect(
      matches(vaga(diasAtras(40), 'greenhouse'), preferences(), HOJE),
    ).toBe(true);
  });

  it('vaga sem data passa', () => {
    expect(matches(vaga(null), preferences(), HOJE)).toBe(true);
  });
});

/**
 * O filtro de título PADRÃO, que vale para quem nunca salvou um filtro.
 *
 * Os títulos abaixo são formas reais medidas na Gupy, com empresas trocadas.
 * Todos eram descartados antes de o padrão conhecer front-end.
 */
describe('títulos com o filtro padrão', () => {
  function titled(title: string): JobSearchResult {
    return { ...job(null), title, source: 'gupy' };
  }

  it.each([
    ['Especialista Frontend (REACT)'],
    ['DEV FRONT END VUE.JS PL - RH0000'],
    ['Senior Front-End [Commerce Cloud]'],
    ['Desarrollador Frontend Web & Mobile'],
    ['Líder Técnico III (React / NodeJS)'],
    ['Especialista Drupal'],
    ['Analista WordPress Pleno'],
  ])('mantém "%s"', (title) => {
    expect(matches(titled(title), defaultJobPreferences)).toBe(true);
  });

  it.each([
    ['Executivo de Vendas'],
    ['Estágio em Desenvolvimento Front End'],
    ['Analista Financeiro'],
  ])('continua descartando "%s"', (title) => {
    expect(matches(titled(title), defaultJobPreferences)).toBe(false);
  });
});

describe('modalidade', () => {
  function comModalidade(workModel: JobSearchResult['workModel']) {
    return { ...job(null), workModel };
  }

  it('sem a opção, vaga que não informa continua passando', () => {
    expect(
      matches(comModalidade(null), preferences({ workModels: ['remoto'] })),
    ).toBe(true);
  });

  it('com a opção, "Remoto" vira remoto confirmado', () => {
    const estrito = preferences({
      workModels: ['remoto'],
      hideUndeclaredWorkModel: true,
    });

    expect(matches(comModalidade(null), estrito)).toBe(false);
    expect(matches(comModalidade('remoto'), estrito)).toBe(true);
    expect(matches(comModalidade('presencial'), estrito)).toBe(false);
  });

  it('a opção não corta nada sem modalidade marcada', () => {
    expect(
      matches(
        comModalidade(null),
        preferences({ hideUndeclaredWorkModel: true }),
      ),
    ).toBe(true);
  });
});
