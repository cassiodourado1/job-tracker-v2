/**
 * Reduz as várias URLs da mesma vaga a uma só.
 *
 * Isto não é higiene, é correção: a URL é a única identidade que uma vaga
 * externa tem — é a chave do `Job.url @unique`, do casamento com "já salva" e,
 * a partir da fase 2, do descarte permanente. Se a mesma vaga chega com duas
 * URLs, o descarte não pega e ela volta na próxima rodada.
 *
 * As divergências são reais e foram observadas nas fontes:
 *
 *   Greenhouse  job-boards.greenhouse.io/x/jobs/1  vs  boards.greenhouse.io/...
 *               e um `?gh_src=` grudado no fim
 *   Lever       hostedUrl  vs  applyUrl (= hostedUrl + "/apply")
 *   Ashby       jobUrl     vs  applyUrl (= jobUrl + "/application")
 *   Gupy        `?jobBoardSource=gupy_portal` no fim de todas, e o caminho
 *               `/job/<token>`, em que o token é um JSON em base64 com o id
 *               da vaga E o canal de origem ("gupy_portal", "remotar"). A
 *               mesma vaga chega com tokens diferentes por canal.
 *   LinkedIn    /comm/jobs/view/123  vs  /jobs/view/123, `www.` vs `br.`,
 *               slug opcional antes do id, e oito parâmetros de rastreio
 */

/** Hosts que servem o mesmo board sob nomes diferentes. */
const HOST_ALIASES: Record<string, string> = {
  'job-boards.greenhouse.io': 'boards.greenhouse.io',
  'www.remoteok.com': 'remoteok.com',
  'remoteok.io': 'remoteok.com',
};

/** Sufixos que apontam para o formulário, não para a vaga. */
const APPLY_SUFFIXES = ['/apply', '/application'];

export function canonicalJobUrl(rawUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  // A query aqui é sempre rastreamento (`gh_src`, `jobBoardSource`); nenhuma
  // fonte identifica a vaga por parâmetro. Se alguma passar a identificar,
  // isto vira uma lista de parâmetros preservados.
  url.search = '';
  url.hash = '';
  url.protocol = 'https:';
  url.hostname =
    HOST_ALIASES[url.hostname.toLowerCase()] ?? url.hostname.toLowerCase();

  // LinkedIn é uma REGRA de host, não uma entrada em `HOST_ALIASES`: um mapa
  // estático não expressa `*.linkedin.com`, e `br.linkedin.com` é exatamente o
  // que se obtém copiando link de uma sessão deslogada.
  if (
    url.hostname === 'linkedin.com' ||
    url.hostname.endsWith('.linkedin.com')
  ) {
    const job = url.pathname.match(
      /^(?:\/comm)?\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/,
    );

    // `null` para qualquer outro caminho, e isto é o que importa: como a query
    // já foi descartada acima, `/jobs/search/?currentJobId=123` viraria
    // `/jobs/search` — e DUAS vagas diferentes colapsariam numa identidade só.
    // Uma dispensa esconderia as duas, e `Job.url @unique` colidiria. Devolver
    // `null` transforma colisão silenciosa no erro que `dismiss()` já trata.
    return job ? `https://www.linkedin.com/jobs/view/${job[1]}` : null;
  }

  let path = url.pathname.replace(/\/+$/, '');

  for (const suffix of APPLY_SUFFIXES) {
    if (path.toLowerCase().endsWith(suffix)) {
      path = path.slice(0, -suffix.length);
      break;
    }
  }

  url.pathname = gupyJobPath(url.hostname, path) ?? path;

  return url.toString();
}

/**
 * `/job/<token>` da Gupy reduzido a `/jobs/<id>`.
 *
 * O token decodificado é `{"jobId":12678997,"source":"remotar"}`: o id é a
 * vaga, o `source` é quem mandou você até ela. A Remotar repassa vaga da Gupy
 * com o próprio `source`, e sem esta regra a mesma vaga aparecia duas vezes —
 * uma por canal — e descartar uma não escondia a outra.
 *
 * `/jobs/<id>` não é invenção: é o endereço clássico das páginas de carreira
 * da Gupy, e abre a mesma vaga (verificado em outubro de 2026).
 *
 * Token que não decodifica para um id numérico fica como está: vale mais uma
 * duplicata eventual que duas vagas colapsadas numa identidade só.
 */
function gupyJobPath(hostname: string, path: string): string | null {
  if (!hostname.endsWith('.gupy.io')) {
    return null;
  }

  const token = path.match(/^\/job\/([A-Za-z0-9+_-]+=*)$/)?.[1];

  if (!token) {
    return null;
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(token, 'base64').toString('utf8'),
    );
    const jobId =
      decoded && typeof decoded === 'object' && 'jobId' in decoded
        ? decoded.jobId
        : null;

    return typeof jobId === 'number' && Number.isInteger(jobId) && jobId > 0
      ? `/jobs/${jobId}`
      : null;
  } catch {
    return null;
  }
}
