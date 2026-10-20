import { fetchPublicPage } from '../../safe-fetch';
import { GeekHunterSource, isWanted, readGeekHunterList } from './geekhunter';

jest.mock('../../safe-fetch', () => ({ fetchPublicPage: jest.fn() }));

const fetchPage = fetchPublicPage as jest.MockedFunction<
  typeof fetchPublicPage
>;

/** Listagem SINTÉTICA, com a estrutura real do ItemList da página. */
function listing(items: { url: string; name: string }[]): string {
  return `<html><head>
<script type="application/ld+json" id="org">{"@type":"Organization","name":"GeekHunter"}</script>
<script type="application/ld+json" id="lista">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      ...item,
    })),
  })}</script></head><body></body></html>`;
}

describe('readGeekHunterList', () => {
  it('lê as vagas do ItemList e ignora endereço fora do formato de vaga', () => {
    const jobs = readGeekHunterList(
      listing([
        {
          url: 'https://www.geekhunter.com/pt/empresa-exemplo/jobs/desenvolvedor-react-1',
          name: ' Desenvolvedor React ',
        },
        { url: 'https://outro-site.com/pt/x/jobs/y', name: 'Fora do portal' },
        { url: 'https://www.geekhunter.com/pt/blog', name: 'Blog' },
      ]),
    );

    expect(jobs).toEqual([
      {
        url: 'https://www.geekhunter.com/pt/empresa-exemplo/jobs/desenvolvedor-react-1',
        title: 'Desenvolvedor React',
      },
    ]);
  });

  it('sem ItemList devolve vazio, para a fonte acusar layout mudado', () => {
    expect(readGeekHunterList('<html></html>')).toEqual([]);
  });
});

describe('isWanted', () => {
  it('abre título de desenvolvimento, em português ou inglês', () => {
    expect(isWanted('Desenvolvedor(a) Front-end Sênior', [])).toBe(true);
    expect(isWanted('Senior Software Engineer', [])).toBe(true);
    expect(isWanted('Desenvolvedor Full Stack | Java + Angular', [])).toBe(
      true,
    );
  });

  it('pula o que não é desenvolvimento, a menos que seja termo do perfil', () => {
    expect(isWanted('Analista de Suporte', [])).toBe(false);
    expect(isWanted('Engenheiro de Dados', [])).toBe(false);
    expect(isWanted('Engenheiro de Dados', ['engenheiro de dados'])).toBe(true);
  });
});

describe('GeekHunterSource', () => {
  const VAGA =
    'https://www.geekhunter.com/pt/empresa-exemplo/jobs/desenvolvedor-react-1';

  /** Página de vaga SINTÉTICA, com o JobPosting que o portal publica. */
  const paginaVaga = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'JobPosting',
    title: 'Desenvolvedor React',
    datePosted: '2026-10-19',
    jobLocationType: 'TELECOMMUTE',
    hiringOrganization: { name: 'Empresa Exemplo' },
  })}</script>`;

  beforeEach(() => {
    fetchPage.mockReset();
    fetchPage.mockImplementation((url: string) =>
      Promise.resolve({
        finalUrl: url,
        html: url.includes('/jobs/')
          ? paginaVaga
          : url.endsWith('/pt/vagas')
            ? listing([{ url: VAGA, name: 'Desenvolvedor React' }])
            : '<html></html>',
      }),
    );
  });

  it('não reabre na rodada seguinte a vaga que já leu', async () => {
    const source = new GeekHunterSource();

    const first = await source.fetch({ terms: [] });
    const second = await source.fetch({ terms: [] });

    const opened = fetchPage.mock.calls.filter(([url]) =>
      url.includes('/jobs/'),
    );

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      company: 'Empresa Exemplo',
      workModel: 'remoto',
      source: 'geekhunter',
    });
    expect(second).toEqual(first);
    expect(opened).toHaveLength(1);
  });
});
