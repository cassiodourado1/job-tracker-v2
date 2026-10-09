import { STACK_LABELS } from '@recruit/shared';
import {
  contractTypeFromLabel,
  workModelFromTitle,
  countryFromText,
  STACK_VOCABULARY,
  stackFromText,
} from './normalize';

/**
 * Localização brasileira.
 *
 * Existe porque `withinScope` trata localização não nula que não seja Brasil
 * como definitivamente estrangeira: classificar errado aqui não devolve uma
 * vaga com o país errado, **some com a vaga**. E some em silêncio — sem log e
 * sem entrar em `failedSources`.
 *
 * Os formatos abaixo são os que o LinkedIn usa de verdade, copiados dos
 * alertas reais.
 */
describe('countryFromText', () => {
  it.each([
    ['Salvador, BA'],
    ['São Paulo, SP'],
    ['Porto Alegre, RS'],
    ['São Paulo e Região'],
    ['Rio de Janeiro e Região'],
    ['Brasil'],
    ['Sorocaba, SP'],
    ['Greater São Paulo Area'],
  ])('reconhece %s como Brasil', (local) => {
    expect(countryFromText(local)).toBe('Brasil');
  });

  it.each([
    ['Caxias do Sul, RS'],
    ['Petrópolis, RJ'],
    ['Chapecó, SC'],
    ['Feira de Santana, BA'],
  ])('reconhece pela sigla de UF cidade fora da lista: %s', (local) => {
    // A lista de capitais não cobre o interior. Sem o padrão de UF, estas
    // saíam como `null` — o que ainda passava no filtro, mas por acidente:
    // "não sei onde é" em vez de "é no Brasil". Com `scope: 'internacional'`
    // a diferença deixa de ser acadêmica e a vaga brasileira vaza.
    expect(countryFromText(local)).toBe('Brasil');
  });

  it('cidade brasileira vence Portugal', () => {
    // O padrão português casa `\bporto\b`. Antes desta ordem, "Porto Alegre"
    // saía como Portugal e a vaga sumia com `scope: 'brasil'`.
    expect(countryFromText('Porto Alegre, RS')).toBe('Brasil');
    expect(countryFromText('Porto')).toBe('Portugal');
    expect(countryFromText('Lisboa')).toBe('Portugal');
  });

  it('cidade estrangeira vence a sigla de UF', () => {
    // MA, PA, SC, AL, MT e MS também são estados americanos. A sigla é testada
    // por último justamente para a cidade decidir primeiro.
    expect(countryFromText('Boston, MA')).toBe('Estados Unidos');
    expect(countryFromText('Austin, TX')).toBe('Estados Unidos');
    expect(countryFromText('Toronto, ON')).toBe('Canadá');
  });

  it('não chuta o que não reconhece', () => {
    // `null` é o que faz `withinScope` deixar passar. Um palpite aqui vira
    // vaga descartada.
    expect(countryFromText('Kraków')).toBeNull();
    expect(countryFromText('')).toBeNull();
    expect(countryFromText(null)).toBeNull();
  });
});

/**
 * Tecnologias detectadas na descrição.
 *
 * Os casos de front-end e CMS entraram juntos, e os negativos importam tanto
 * quanto os positivos: um rótulo que aparece em toda vaga dos EUA por causa do
 * parágrafo padrão de RH empurraria para o topo vagas que não pedem nada disso.
 */
describe('stackFromText', () => {
  it.each([
    ['Experiência com Nuxt 3 e Vue 3', ['Vue', 'Nuxt']],
    ['Stack: NuxtJS, Pinia', ['Nuxt']],
    ['Site institucional em Gatsby', ['Gatsby']],
    ['Estilização com Tailwind CSS', ['Tailwind']],
    ['SCSS e BEM', ['Sass']],
    ['Manter o Design System no Storybook', ['Design System']],
    ['Conhecimento de WCAG 2.1', ['Acessibilidade']],
    ['Experience with web accessibility', ['Acessibilidade']],
    ['Acessibilidade digital e semântica', ['Acessibilidade']],
    ['Dashboards com Highcharts', ['Visualização de dados']],
    ['Charts with D3.js', ['Visualização de dados']],
    ['Desenvolvedor Drupal 10', ['Drupal']],
    ['Temas WordPress e WooCommerce', ['WordPress']],
  ])('reconhece em "%s"', (text, expected) => {
    // Contém, e não igual: "D3.js" também marca JavaScript, pela regra de
    // `.js` que já existia, e isso não é o que este teste verifica.
    expect(stackFromText(text)).toEqual(expect.arrayContaining(expected));
  });

  it.each([
    [
      'We provide reasonable accessibility accommodations during the interview process.',
    ],
    [
      'Vaga afirmativa para pessoas com deficiência, com acessibilidade no escritório.',
    ],
    ['Classic novels like The Great Gatsbyesque prose'],
    ['Our product design team'],
  ])('não marca nada em "%s"', (text) => {
    expect(stackFromText(text)).toEqual([]);
  });

  it('não confunde Nuxt com Next.js', () => {
    expect(stackFromText('Next.js')).not.toContain('Nuxt');
    expect(stackFromText('Nuxt.js')).not.toContain('Next.js');
  });
});

/**
 * As opções do filtro e o detector precisam ser o mesmo conjunto. Um rótulo
 * que o filtro oferece e o detector não acha é um controle que não faz nada;
 * um que o detector acha e o filtro não oferece aparece na vaga sem poder ser
 * priorizado.
 */
describe('STACK_VOCABULARY', () => {
  it('cobre exatamente os rótulos oferecidos no filtro', () => {
    const detected = [...new Set(STACK_VOCABULARY.map(([, label]) => label))];

    expect([...detected].sort()).toEqual([...STACK_LABELS].sort());
  });
});

/**
 * Os valores de `type` abaixo são os que a Gupy usa de verdade, medidos no
 * portal em outubro de 2026.
 */
describe('contractTypeFromLabel', () => {
  it.each([
    ['vacancy_type_effective', 'clt'],
    ['vacancy_legal_entity', 'pj'],
    ['vacancy_type_autonomous', 'pj'],
    ['vacancy_type_internship', 'estagio'],
    ['vacancy_type_temporary', 'temporario'],
    ['Legal Entity', 'pj'],
  ])('%s vira %s', (label, expected) => {
    expect(contractTypeFromLabel(label)).toBe(expected);
  });

  it('não chuta terceirizado nem banco de talentos', () => {
    expect(contractTypeFromLabel('vacancy_type_outsource')).toBeNull();
    expect(contractTypeFromLabel('vacancy_type_talent_pool')).toBeNull();
  });
});

describe('workModelFromTitle', () => {
  it.each([
    ['DESENVOLVEDOR(A) FULL STACK - Presencial', 'presencial'],
    ['Desenvolvedor .Net Presencial - Bom Retiro', 'presencial'],
    ['Front-end Sênior (Remoto)', 'remoto'],
    ['Junior/Pleno Front-End Engineer - Remote', 'remoto'],
    ['Dev Vue - Home Office', 'remoto'],
    ['Analista de Sistemas Híbrido', 'hibrido'],
  ])('%s → %s', (title, expected) => {
    expect(workModelFromTitle(title)).toBe(expected);
  });

  it.each([
    ['Desenvolvedor Full Stack Presencial ou Híbrido'],
    ['Desenvolvedor Full Stack'],
    ['Remote-first company, vaga presencial'],
  ])('não chuta em "%s"', (title) => {
    expect(workModelFromTitle(title)).toBeNull();
  });
});
