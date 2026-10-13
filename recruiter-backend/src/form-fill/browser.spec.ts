import {
  chooseBrowser,
  defaultFromLaunchServices,
  defaultFromRegistry,
} from './browser';

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

describe('navegador padrão do sistema', () => {
  it('vem antes do Chrome quando é um da lista', () => {
    expect(
      chooseBrowser({
        platform: 'darwin',
        exists: only(CHROME, BRAVE),
        defaultId: 'com.brave.browser',
      }),
    ).toEqual({ name: 'Brave', executablePath: BRAVE });
  });

  it('padrão que não serve (Safari) cai na ordem da lista', () => {
    expect(
      chooseBrowser({
        platform: 'darwin',
        exists: only(CHROME, BRAVE),
        defaultId: 'com.apple.Safari',
      }),
    ).toEqual({ name: 'Google Chrome', channel: 'chrome' });
  });

  it('padrão da lista mas não instalado cai no próximo', () => {
    expect(
      chooseBrowser({
        platform: 'darwin',
        exists: only(BRAVE),
        defaultId: 'com.google.chrome',
      }),
    ).toEqual({ name: 'Brave', executablePath: BRAVE });
  });

  it('o caminho do .env continua vencendo o padrão', () => {
    expect(
      chooseBrowser({
        override: '/opt/meu-navegador',
        platform: 'darwin',
        exists: only(BRAVE, '/opt/meu-navegador'),
        defaultId: 'com.brave.browser',
      }),
    ).toEqual({
      name: 'o navegador do .env',
      executablePath: '/opt/meu-navegador',
    });
  });

  it('lê o app de https nas preferências do macOS', () => {
    const json = JSON.stringify({
      LSHandlers: [
        { LSHandlerContentType: 'public.html', LSHandlerRoleAll: 'outro' },
        { LSHandlerURLScheme: 'https', LSHandlerRoleAll: 'com.brave.browser' },
      ],
    });

    expect(defaultFromLaunchServices(json)).toBe('com.brave.browser');
    expect(defaultFromLaunchServices('{}')).toBeNull();
  });

  it('lê o ProgId do registro do Windows', () => {
    expect(
      defaultFromRegistry(
        '\r\nHKEY_CURRENT_USER\\...\\UserChoice\r\n    ProgId    REG_SZ    ChromeHTML\r\n',
      ),
    ).toBe('ChromeHTML');
  });
});

describe('sem navegador Chromium instalado', () => {
  const BUNDLED = '/cache/ms-playwright/chromium/chrome';

  it('usa o Chromium do Playwright, se instalado', () => {
    expect(
      chooseBrowser({
        platform: 'linux',
        exists: only(BUNDLED),
        defaultId: 'firefox.desktop',
        bundledPath: BUNDLED,
      }),
    ).toEqual({ name: 'Chromium do Playwright', executablePath: BUNDLED });
  });

  it('navegador do sistema vem antes do Chromium do Playwright', () => {
    expect(
      chooseBrowser({
        platform: 'darwin',
        exists: only(BRAVE, BUNDLED),
        bundledPath: BUNDLED,
      }),
    ).toEqual({ name: 'Brave', executablePath: BRAVE });
  });

  it('sem nenhum, devolve null para a tela dizer o que instalar', () => {
    expect(
      chooseBrowser({
        platform: 'win32',
        exists: only(),
        bundledPath: BUNDLED,
      }),
    ).toBeNull();
  });
});
