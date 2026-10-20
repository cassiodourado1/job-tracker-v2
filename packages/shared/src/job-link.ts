/**
 * O endereço para ABRIR uma vaga, que nem sempre é o que a identifica.
 *
 * A InHire identifica a vaga pelo uuid, e o app guarda `/vagas/<uuid>` — é o
 * que junta a mesma vaga vinda da Remotar (com nome no fim) e da página da
 * empresa (sem nome). Mas o site dela só abre com o nome: `/vagas/<uuid>`
 * sozinho mostra uma página preta. Medido em outubro de 2026.
 *
 * Por isso a identidade fica como está, e o nome é posto só na hora de abrir,
 * a partir do título — do jeito que a InHire gera: 40 de 40 links conferidos.
 */
const INHIRE_JOB =
  /^\/vagas\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;

export function openableJobUrl(url: string, title: string): string {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (
    !parsed.hostname.endsWith('.inhire.app') ||
    !INHIRE_JOB.test(parsed.pathname)
  ) {
    return url;
  }

  const slug = inhireSlug(title);

  if (!slug) {
    return url;
  }

  parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/${slug}`;

  return parsed.toString();
}

/**
 * "Gerente de Negócios | São Paulo (SP)" → "gerente-de-negocios-or-sao-paulo-sp".
 * Sem acento, "|" vira "or" e "&" vira "and", o resto que não é letra,
 * número, espaço ou hífen some, e espaços e hífens seguidos viram um hífen.
 */
export function inhireSlug(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\|/g, 'or')
    .replace(/&/g, 'and')
    .replace(/[^A-Za-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}
