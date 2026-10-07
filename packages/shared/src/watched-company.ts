/**
 * Empresa acompanhada: de qual plataforma é a página de vagas que você colou.
 *
 * A maioria das empresas não tem sistema de vagas próprio: a página "Vagas"
 * do site delas mostra vagas hospedadas numa plataforma de recrutamento. Pelo
 * endereço dessa plataforma dá para ler TODAS as vagas da empresa por API —
 * mais do que a busca por termo de um portal acha.
 *
 * Vive no pacote compartilhado porque os dois lados precisam: a tela mostra
 * na hora o que reconheceu em cada endereço, e a descoberta usa o mesmo
 * reconhecimento para escolher o leitor. Sem rede: é só o endereço.
 */

export const WATCHED_PLATFORMS = [
  'gupy',
  'inhire',
  'greenhouse',
  'lever',
  'ashby',
  'ciandt',
  'squadra',
] as const;

export type WatchedPlatform = (typeof WATCHED_PLATFORMS)[number];

export interface WatchedCompany {
  platform: WatchedPlatform;
  /** Identificador da empresa na plataforma: o subdomínio ou o caminho. */
  slug: string;
}

/** Como a tela escreve cada plataforma. */
export const WATCHED_PLATFORM_LABELS: Record<WatchedPlatform, string> = {
  gupy: 'Gupy',
  inhire: 'InHire',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  ciandt: 'site da CI&T',
  squadra: 'site da Squadra',
};

/** Subdomínios da própria plataforma, que não são empresa nenhuma. */
const RESERVED = new Set([
  'www',
  'portal',
  'login',
  'api',
  'auth',
  'files',
  'app',
  'employability-portal',
]);

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * A empresa por trás de um endereço, ou `null` quando não se reconhece.
 *
 * `null` não é erro: é a tela dizendo "esse eu não sei ler", em vez de a
 * empresa sumir da busca sem explicação.
 */
export function watchedCompanyFromUrl(raw: string): WatchedCompany | null {
  let url: URL;

  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const firstSegment = url.pathname
    .split('/')
    .filter(Boolean)[0]
    ?.toLowerCase();

  const subdomainOf = (domain: string): string | null => {
    if (!host.endsWith(`.${domain}`)) {
      return null;
    }

    const slug = host.slice(0, -domain.length - 1);

    return SLUG.test(slug) && !RESERVED.has(slug) ? slug : null;
  };

  const pathOf = (...hosts: string[]): string | null =>
    hosts.includes(host) && firstSegment && SLUG.test(firstSegment)
      ? firstSegment
      : null;

  const gupy = subdomainOf('gupy.io');
  if (gupy) return { platform: 'gupy', slug: gupy };

  const inhire = subdomainOf('inhire.app');
  if (inhire) return { platform: 'inhire', slug: inhire };

  const greenhouse = pathOf('boards.greenhouse.io', 'job-boards.greenhouse.io');
  if (greenhouse) return { platform: 'greenhouse', slug: greenhouse };

  const lever = pathOf('jobs.lever.co');
  if (lever) return { platform: 'lever', slug: lever };

  const ashby = pathOf('jobs.ashbyhq.com');
  if (ashby) return { platform: 'ashby', slug: ashby };

  if (host === 'ciandt.com' || host.endsWith('.ciandt.com')) {
    return { platform: 'ciandt', slug: 'ciandt' };
  }

  if (host === 'squadra.com.br' || host.endsWith('.squadra.com.br')) {
    return { platform: 'squadra', slug: 'squadra' };
  }

  return null;
}
