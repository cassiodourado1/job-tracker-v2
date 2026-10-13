import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Qual navegador abrir para o preenchimento de formulário.
 *
 * O Playwright fala com qualquer navegador baseado em Chromium, mas o código
 * só tentava o Google Chrome (`channel: 'chrome'`). Quem usa Brave, Edge ou
 * Chromium recebia "chrome is not found" e ficava sem o preenchimento.
 *
 * O navegador abre com um perfil PRÓPRIO, fora da pasta do projeto: não
 * mexe nas abas nem nos logins do navegador do dia a dia.
 *
 * O padrão do sistema vem primeiro, quando é um destes: quem usa Brave não
 * espera ver o Chrome abrir só porque ele também está instalado. Safari e
 * Firefox não servem (o Playwright conduz só Chromium aqui), e aí vale a
 * ordem da lista.
 *
 * Por último, o Chromium do próprio Playwright, quando instalado: é a saída
 * de quem só tem Firefox ou Safari, em qualquer sistema, com um comando
 * (`npx playwright-core install chromium`).
 */

export interface BrowserChoice {
  /** Como a tela chama o navegador escolhido. */
  name: string;
  /** Caminho do executável; ausente quando o Playwright acha o Chrome sozinho. */
  executablePath?: string;
  channel?: 'chrome';
}

interface Candidate {
  name: string;
  paths: Partial<Record<NodeJS.Platform, string[]>>;
  /**
   * Como o sistema chama este navegador quando ele é o padrão: bundle id no
   * macOS, arquivo .desktop no Linux, ProgId no Windows. Em minúsculas.
   */
  ids: string[];
}

/**
 * Em ordem de preferência. Chrome primeiro, porque é o que o Playwright
 * conhece pelo canal; os outros entram pelo caminho do executável.
 */
const CANDIDATES: Candidate[] = [
  {
    name: 'Google Chrome',
    ids: ['com.google.chrome', 'google-chrome.desktop', 'chromehtml'],
    paths: {
      darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
      win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
    },
  },
  {
    name: 'Brave',
    ids: ['com.brave.browser', 'brave-browser.desktop', 'bravehtml'],
    paths: {
      darwin: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
      linux: ['/usr/bin/brave-browser', '/usr/bin/brave'],
      win32: [
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      ],
    },
  },
  {
    name: 'Microsoft Edge',
    ids: ['com.microsoft.edgemac', 'microsoft-edge.desktop', 'msedgehtm'],
    paths: {
      darwin: [
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ],
      linux: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
      win32: [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ],
    },
  },
  {
    name: 'Chromium',
    ids: [
      'org.chromium.chromium',
      'chromium.desktop',
      'chromium-browser.desktop',
    ],
    paths: {
      darwin: ['/Applications/Chromium.app/Contents/MacOS/Chromium'],
      linux: ['/usr/bin/chromium', '/usr/bin/chromium-browser'],
    },
  },
  {
    name: 'Vivaldi',
    ids: ['com.vivaldi.vivaldi', 'vivaldi-stable.desktop'],
    paths: {
      darwin: ['/Applications/Vivaldi.app/Contents/MacOS/Vivaldi'],
      linux: ['/usr/bin/vivaldi'],
    },
  },
];

/**
 * O navegador a abrir, ou `null` se não há nenhum.
 *
 * `override` (FORM_FILL_BROWSER_PATH no .env) vence tudo: é a saída para
 * navegador instalado fora do lugar padrão. Depois vem o navegador padrão do
 * sistema (`defaultId`, de `detectDefaultBrowser`), se for um da lista.
 */
export function chooseBrowser(
  options: {
    override?: string;
    platform?: NodeJS.Platform;
    exists?: (path: string) => boolean;
    defaultId?: string | null;
    /** Onde o Playwright instala o Chromium dele (`chromium.executablePath()`). */
    bundledPath?: string;
  } = {},
): BrowserChoice | null {
  const exists = options.exists ?? existsSync;
  const platform = options.platform ?? process.platform;

  if (options.override) {
    return exists(options.override)
      ? { name: 'o navegador do .env', executablePath: options.override }
      : null;
  }

  const defaultId = options.defaultId?.toLowerCase();
  const ordered = defaultId
    ? [
        ...CANDIDATES.filter((item) => item.ids.includes(defaultId)),
        ...CANDIDATES.filter((item) => !item.ids.includes(defaultId)),
      ]
    : CANDIDATES;

  for (const candidate of ordered) {
    const path = (candidate.paths[platform] ?? []).find((item) => exists(item));

    if (path) {
      return candidate.name === 'Google Chrome'
        ? { name: candidate.name, channel: 'chrome' }
        : { name: candidate.name, executablePath: path };
    }
  }

  if (options.bundledPath && exists(options.bundledPath)) {
    return {
      name: 'Chromium do Playwright',
      executablePath: options.bundledPath,
    };
  }

  return null;
}

/**
 * Como o sistema chama o navegador padrão, ou `null` se não deu para saber.
 *
 * Melhor esforço: cada sistema guarda isso num lugar, e qualquer falha (sem
 * o comando, formato inesperado, demora) cai na ordem da lista, que é o que
 * acontecia antes.
 */
export function detectDefaultBrowser(
  platform: NodeJS.Platform = process.platform,
): string | null {
  try {
    if (platform === 'darwin') {
      const plist = join(
        homedir(),
        'Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist',
      );

      return defaultFromLaunchServices(
        run('plutil', ['-convert', 'json', '-o', '-', plist]),
      );
    }

    if (platform === 'linux') {
      return run('xdg-settings', ['get', 'default-web-browser']).trim() || null;
    }

    if (platform === 'win32') {
      return defaultFromRegistry(
        run('reg', [
          'query',
          'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice',
          '/v',
          'ProgId',
        ]),
      );
    }
  } catch {
    return null;
  }

  return null;
}

/** O app que abre `https` nas preferências do LaunchServices, em JSON. */
export function defaultFromLaunchServices(json: string): string | null {
  const data = JSON.parse(json) as {
    LSHandlers?: { LSHandlerURLScheme?: string; LSHandlerRoleAll?: string }[];
  };
  const handler = data.LSHandlers?.find(
    (item) => item.LSHandlerURLScheme === 'https',
  );

  return handler?.LSHandlerRoleAll ?? null;
}

/**
 * O ProgId da saída do `reg query` ("ChromeHTML", "MSEdgeHTM"). Sem
 * conferência num Windows real: se o nome não casar com a lista, vale a
 * ordem dela, como antes.
 */
export function defaultFromRegistry(output: string): string | null {
  return /ProgId\s+REG_SZ\s+(\S+)/i.exec(output)?.[1] ?? null;
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    timeout: 2000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}
