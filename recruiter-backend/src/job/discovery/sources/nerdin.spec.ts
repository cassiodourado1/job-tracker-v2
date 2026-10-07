import { fetchPublicPage } from '../../safe-fetch';
import { cardToResult, NerdinSource, readNerdinCards } from './nerdin';

jest.mock('../../safe-fetch', () => ({ fetchPublicPage: jest.fn() }));

const fetchPage = fetchPublicPage as jest.MockedFunction<
  typeof fetchPublicPage
>;

/**
 * Cards SINTÉTICOS, com a marcação medida na busca em outubro de 2026. Empresas
 * e ids são inventados.
 */

function card(opcoes: {
  id: number;
  titulo: string;
  nova?: boolean;
  resumo?: string;
  empresa?: string;
  local?: string;
  data?: string;
  hashtags?: string[];
}): string {
  return `
    <div class="vaga-card" data-href="vaga_emprego/vaga-exemplo-${opcoes.id}.php" style="cursor: pointer;">
      <div class="row"><div class="col-md-8">
        <h3 class="vaga-titulo">
          ${opcoes.titulo}
          ${opcoes.nova ? '<span class="vaga-nova-badge" title="Nova">Nova</span>' : ''}
        </h3>
        <p class="vaga-resumo-linha">${opcoes.resumo ?? 'PJ • Senior • Home Office'}</p>
        <div class="vaga-salario-destaque"><i class="fas fa-money-bill-wave"></i><span>Salário a combinar</span></div>
        <div class="vaga-empresa-local">
          <div class="vaga-empresa"><i class="fas fa-building"></i>
            <span class="vaga-empresa-nome">${opcoes.empresa ?? 'Empresa &amp; Cia'}</span>
          </div>
          <div class="vaga-local-linha"><i class="fas fa-map-marker-alt"></i> <span>${opcoes.local ?? 'Home Office'}</span></div>
        </div>
        <p class="vaga-meta-extra">Sistemas • <time datetime="${opcoes.data ?? '2026-10-07T10:04:46-04:00'}" title="07/10/2026">Há 2 horas</time></p>
        <div class="vaga-hashtags">${(
          opcoes.hashtags ?? ['sistemas', 'vuejs', 'front end']
        )
          .map(
            (tag) => `<a href="vagas-${tag}.php" class="hashtag">#${tag}</a>`,
          )
          .join(' ')}</div>
      </div></div>
    </div>`;
}

function pagina(...cards: string[]): string {
  return `<html><body><form method="GET"><input name="busca_vaga"></form>${cards.join('')}</body></html>`;
}

function responde(html: string) {
  return { finalUrl: 'https://www.nerdin.com.br/vagas.php', html };
}

describe('readNerdinCards', () => {
  it('lê o card e tira o selo "Nova" do título', () => {
    const [lido] = readNerdinCards(
      pagina(card({ id: 1, titulo: 'Desenvolvedor Front-End', nova: true })),
    );

    expect(lido).toEqual({
      path: 'vaga_emprego/vaga-exemplo-1.php',
      title: 'Desenvolvedor Front-End',
      summary: ['PJ', 'Senior', 'Home Office'],
      company: 'Empresa & Cia',
      place: 'Home Office',
      publishedAt: '2026-10-07T10:04:46-04:00',
      hashtags: ['sistemas', 'vuejs', 'front end'],
    });
  });
});

describe('cardToResult', () => {
  function converte(opcoes: Parameters<typeof card>[0]) {
    return cardToResult(readNerdinCards(pagina(card(opcoes)))[0]);
  }

  it('converte o card inteiro, com a data exata', () => {
    expect(converte({ id: 9, titulo: 'Front-end Sênior' })).toMatchObject({
      company: 'Empresa & Cia',
      url: 'https://www.nerdin.com.br/vaga_emprego/vaga-exemplo-9.php',
      source: 'nerdin',
      seniority: 'senior',
      workModel: 'remoto',
      contractType: 'pj',
      location: 'Brasil',
      salaryMin: null,
      postedAt: '2026-10-07T14:04:46.000Z',
    });
  });

  it('lê cidade, híbrido e contrato duplo', () => {
    expect(
      converte({
        id: 1,
        titulo: 'Front',
        resumo: 'CLT, PJ • Pleno • Híbrido',
        local: 'São Paulo • SP',
      }),
    ).toMatchObject({
      workModel: 'hibrido',
      contractType: null,
      seniority: 'pleno',
      location: 'São Paulo, SP, Brasil',
    });
  });

  it('estágio e senioridade pelo título quando o resumo não diz', () => {
    expect(
      converte({ id: 1, titulo: 'Desenvolvedor Júnior', resumo: 'Estagio' }),
    ).toMatchObject({ contractType: 'estagio', seniority: 'junior' });
  });

  it('tecnologias vêm das hashtags', () => {
    expect(
      converte({ id: 1, titulo: 'Dev', hashtags: ['drupal', 'php'] })?.stack,
    ).toEqual(expect.arrayContaining<string>(['Drupal', 'PHP']));
  });
});

describe('NerdinSource', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchPage.mockReset();
  });

  afterEach(() => jest.useRealTimers());

  it('busca cada termo e pagina só com página cheia', async () => {
    const cheia = Array.from({ length: 20 }, (_, i) =>
      card({ id: 100 + i, titulo: `Vaga ${i}` }),
    );

    fetchPage
      .mockResolvedValueOnce(responde(pagina(...cheia)))
      .mockResolvedValueOnce(responde(pagina(card({ id: 200, titulo: 'X' }))));

    const jobs = await new NerdinSource().fetch({ terms: ['front-end'] });

    expect(jobs).toHaveLength(21);
    expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
      'https://www.nerdin.com.br/vagas.php?busca_vaga=front-end',
      'https://www.nerdin.com.br/vagas.php?busca_vaga=front-end&pagina=2',
    ]);
  });

  it('busca sem resultado é lista vazia, não falha', async () => {
    fetchPage.mockResolvedValue(responde(pagina()));

    await expect(
      new NerdinSource().fetch({ terms: ['clojure'] }),
    ).resolves.toEqual([]);
  });

  it('falha a fonte quando a página não é a listagem', async () => {
    fetchPage.mockResolvedValue(responde('<html>outra coisa</html>'));

    await expect(new NerdinSource().fetch({})).rejects.toThrow('layout mudou');
  });
});
