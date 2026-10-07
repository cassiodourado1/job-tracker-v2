import { redactResume } from './redact';

/**
 * Currículo SINTÉTICO, com a forma de um currículo brasileiro comum: nome no
 * topo, linha de contatos, links, e depois a parte profissional. A pessoa é
 * inventada — e o sobrenome dela é também o nome da cidade, de propósito.
 */
const CURRICULO = `ANA CLARA BARREIRAS
Desenvolvedora Front-end Sênior | React, Vue e TypeScript
Barreiras, Bahia, Brasil | Disponibilidade para trabalho remoto
E-mail: ana.barreiras@exemplo.com.br | Telefones: (77) 98888-1234 e +55 11 3333-4444
LinkedIn: linkedin.com/in/ana-barreiras | GitHub: https://github.com/anabarreiras
Portfólio: https://anabarreiras.dev
CPF: 123.456.789-09
Data de nascimento: 01/02/1990

RESUMO
Desenvolvedora com 10 anos de experiência. Ana Clara Barreiras liderou o
Design System da Empresa Exemplo entre 2016 – 2018 e 2019 – 2024.

EXPERIÊNCIA
Empresa Exemplo — Desenvolvedora Front-end Sênior
2019 – 2024 | Remoto`;

describe('redactResume', () => {
  const result = redactResume(CURRICULO, 'Ana Clara Barreiras');

  it('tira nome, contatos, links e documentos do texto', () => {
    expect(result.text).not.toMatch(/ana clara barreiras/i);
    expect(result.text).not.toContain('ana.barreiras@exemplo.com.br');
    expect(result.text).not.toContain('98888-1234');
    expect(result.text).not.toContain('3333-4444');
    expect(result.text).not.toContain('linkedin.com/in/ana-barreiras');
    expect(result.text).not.toContain('github.com/anabarreiras');
    expect(result.text).not.toContain('anabarreiras.dev');
    expect(result.text).not.toContain('123.456.789-09');
    expect(result.text).not.toContain('01/02/1990');
  });

  it('mantém o endereço, mesmo com o sobrenome igual à cidade', () => {
    expect(result.text).toContain('Barreiras, Bahia, Brasil');
  });

  it('mantém a parte profissional e os períodos', () => {
    expect(result.text).toContain('Desenvolvedora Front-end Sênior');
    expect(result.text).toContain('2016 – 2018');
    expect(result.text).toContain('2019 – 2024 | Remoto');
    expect(result.text).toContain('Design System da Empresa Exemplo');
  });

  it('devolve os contatos à parte, para preencher o perfil sem passar pela IA', () => {
    expect(result.email).toBe('ana.barreiras@exemplo.com.br');
    expect(result.phone).toBe('(77) 98888-1234');
    expect(result.links).toEqual({
      linkedin: 'https://linkedin.com/in/ana-barreiras',
      github: 'https://github.com/anabarreiras',
      website: 'https://anabarreiras.dev',
    });
  });

  it('diz o que foi tirado', () => {
    expect(result.removed).toEqual(
      expect.arrayContaining<string>([
        'nome',
        'email',
        'telefone',
        'LinkedIn',
        'GitHub',
        'links',
        'documentos',
        'dados pessoais',
      ]),
    );
  });

  it('tira a linha do nome no topo mesmo com o nome do perfil abreviado', () => {
    const curto = redactResume(
      'ANA BARREIRAS\nDesenvolvedora',
      'Ana Clara Barreiras',
    );

    expect(curto.text).toBe('[nome removido]\nDesenvolvedora');
  });

  it('não confunde a primeira linha com nome quando ela é outra coisa', () => {
    const outro = redactResume(
      'Desenvolvedora Front-end Sênior\nBarreiras, Bahia',
      'Ana Clara Barreiras',
    );

    expect(outro.text).toBe(
      'Desenvolvedora Front-end Sênior\nBarreiras, Bahia',
    );
    expect(outro.removed).not.toContain('nome');
  });

  it('sem nada pessoal, o texto passa como veio', () => {
    const limpo = redactResume('Experiência com React desde 2015.', 'Ana');

    expect(limpo).toMatchObject({
      text: 'Experiência com React desde 2015.',
      email: null,
      phone: null,
      removed: [],
    });
  });
});
