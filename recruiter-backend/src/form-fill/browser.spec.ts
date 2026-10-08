import { chooseBrowser } from './browser';

const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function only(...paths: string[]) {
  return (path: string) => paths.includes(path);
}

describe('chooseBrowser', () => {
  it('prefere o Chrome, pelo canal', () => {
    expect(
      chooseBrowser({ platform: 'darwin', exists: only(CHROME, BRAVE) }),
    ).toEqual({ name: 'Google Chrome', channel: 'chrome' });
  });

  it('sem Chrome, usa o Brave pelo caminho do executável', () => {
    expect(chooseBrowser({ platform: 'darwin', exists: only(BRAVE) })).toEqual({
      name: 'Brave',
      executablePath: BRAVE,
    });
  });

  it('o caminho do .env vence tudo', () => {
    expect(
      chooseBrowser({
        override: '/opt/meu-navegador',
        platform: 'darwin',
        exists: only(CHROME, '/opt/meu-navegador'),
      }),
    ).toEqual({
      name: 'o navegador do .env',
      executablePath: '/opt/meu-navegador',
    });
  });

  it('caminho do .env que não existe não cai num navegador escolhido sozinho', () => {
    expect(
      chooseBrowser({
        override: '/opt/nao-existe',
        platform: 'darwin',
        exists: only(CHROME),
      }),
    ).toBeNull();
  });

  it('sem navegador nenhum, devolve null', () => {
    expect(chooseBrowser({ platform: 'darwin', exists: only() })).toBeNull();
  });

  it('procura os caminhos do sistema certo', () => {
    expect(
      chooseBrowser({ platform: 'linux', exists: only('/usr/bin/chromium') }),
    ).toEqual({ name: 'Chromium', executablePath: '/usr/bin/chromium' });
  });
});
