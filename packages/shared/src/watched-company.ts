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
  'workday',
] as const;

export type WatchedPlatform = (typeof WATCHED_PLATFORMS)[number];

export interface WatchedCompany {
  platform: WatchedPlatform;
  /**
   * Identificador da empresa na plataforma: o subdomínio ou o caminho. Na
   * Workday são três partes, `<empresa>.<servidor>/<site>`
   * ("accenture.wd103/AccentureCareers"): a API precisa das três.
   */
  slug: string;
}

/** Como a tela escreve cada plataforma. */
export const WATCHED_PLATFORM_LABELS: Record<WatchedPlatform, string> = {
  gupy: 'Gupy',
  inhire: 'InHire',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
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

  // Workday: `<empresa>.wd<N>.myworkdayjobs.com/[idioma/]<Site>`. O site
  // diferencia maiúsculas ("AccentureCareers") e vem logo depois do idioma,
  // quando há; a mesma empresa pode ter vários (Accenture e Avanade).
  const workday = /^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/.exec(host);

  if (workday) {
    const segments = url.pathname.split('/').filter(Boolean);
    const site = /^[a-z]{2}-[A-Z]{2}$/.test(segments[0] ?? '')
      ? segments[1]
      : segments[0];

    return site && /^[A-Za-z0-9_-]{1,80}$/.test(site)
      ? { platform: 'workday', slug: `${workday[1]}.${workday[2]}/${site}` }
      : null;
  }

  // O site da CI&T só mostra as vagas que ela publica na Lever: medido em
  // outubro de 2026, 198 vagas em `jobs.lever.co/ciandt`. Quem cola o
  // endereço do site acompanha a Lever, sem leitor próprio para quebrar.
  if (host === 'ciandt.com' || host.endsWith('.ciandt.com')) {
    return { platform: 'lever', slug: 'ciandt' };
  }

  return null;
}
