import { inhireSlug, openableJobUrl } from '@recruit/shared';

const ID = '5a495890-cfa3-4224-abb5-fb351502a8d1';

describe('openableJobUrl', () => {
  it('põe o nome da vaga no link da InHire, que sem ele abre vazio', () => {
    expect(
      openableJobUrl(
        `https://acme.inhire.app/vagas/${ID}`,
        ' Analista de Qualidade (QA) ',
      ),
    ).toBe(`https://acme.inhire.app/vagas/${ID}/analista-de-qualidade-qa`);
  });

  it('link que já tem o nome, ou que não é da InHire, fica igual', () => {
    const comNome = `https://acme.inhire.app/vagas/${ID}/qualquer-nome`;

    expect(openableJobUrl(comNome, 'Outro título')).toBe(comNome);
    expect(openableJobUrl('https://acme.gupy.io/jobs/1', 'Dev')).toBe(
      'https://acme.gupy.io/jobs/1',
    );
    expect(openableJobUrl('não é endereço', 'Dev')).toBe('não é endereço');
  });
});

/** Pares título → nome, na forma que os links da InHire usam (medido). */
describe('inhireSlug', () => {
  it.each([
    ['Desenvolvedor JAVA Backend - PLENO', 'desenvolvedor-java-backend-pleno'],
    ['Analista QA- Pleno', 'analista-qa-pleno'],
    [
      'Analista SRE Pleno | Site Reliability Engineering',
      'analista-sre-pleno-or-site-reliability-engineering',
    ],
    [
      ' Gerente de Negócios |São Paulo (SP)',
      'gerente-de-negocios-orsao-paulo-sp',
    ],
    [
      'Analista de Conteúdo | Híbrido – São Paulo/SP',
      'analista-de-conteudo-or-hibrido-sao-paulosp',
    ],
    ['Região Centro-Oeste', 'regiao-centro-oeste'],
  ])('%s → %s', (title, slug) => {
    expect(inhireSlug(title)).toBe(slug);
  });
});
