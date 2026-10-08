import { existsSync } from 'node:fs';

/**
 * Qual navegador abrir para o preenchimento de formulário.
 *
 * O Playwright fala com qualquer navegador baseado em Chromium, mas o código
 * só tentava o Google Chrome (`channel: 'chrome'`). Quem usa Brave, Edge ou
 * Chromium recebia "chrome is not found" e ficava sem o preenchimento.
 *
 * O navegador abre com um perfil PRÓPRIO, fora da pasta do projeto: não
 * mexe nas abas nem nos logins do navegador do dia a dia.
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
}

/**
 * Em ordem de preferência. Chrome primeiro, porque é o que o Playwright
 * conhece pelo canal; os outros entram pelo caminho do executável.
 */
const CANDIDATES: Candidate[] = [
  {
    name: 'Google Chrome',
    paths: {
      darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
      win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
    },
  },
  {
    name: 'Brave',
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
    paths: {
      darwin: ['/Applications/Chromium.app/Contents/MacOS/Chromium'],
      linux: ['/usr/bin/chromium', '/usr/bin/chromium-browser'],
    },
  },
  {
    name: 'Vivaldi',
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
 * navegador instalado fora do lugar padrão.
 */
export function chooseBrowser(
  options: {
    override?: string;
    platform?: NodeJS.Platform;
    exists?: (path: string) => boolean;
  } = {},
): BrowserChoice | null {
  const exists = options.exists ?? existsSync;
  const platform = options.platform ?? process.platform;

  if (options.override) {
    return exists(options.override)
      ? { name: 'o navegador do .env', executablePath: options.override }
      : null;
  }

  for (const candidate of CANDIDATES) {
    const path = (candidate.paths[platform] ?? []).find((item) => exists(item));

    if (path) {
      return candidate.name === 'Google Chrome'
        ? { name: candidate.name, channel: 'chrome' }
        : { name: candidate.name, executablePath: path };
    }
  }

  return null;
}
