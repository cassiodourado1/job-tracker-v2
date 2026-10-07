import {
  DEFAULT_SEARCH_TERMS,
  type JobSearchResult,
  type WatchedCompany,
  type WatchedPlatform,
} from '@recruit/shared';

/**
 * Uma fonte de vagas.
 *
 * Duas famílias vivem atrás desta mesma interface, e a diferença importa para
 * quem monta a watchlist:
 *
 *   por empresa   Greenhouse, Lever, Ashby — leem o board de uma empresa por
 *                 vez, então exigem lista de slugs. Precisão alta, volume baixo.
 *   por busca     Gupy, RemoteOK, Remotive — respondem a palavra-chave sobre o
 *                 acervo inteiro. Volume alto, sem curadoria.
 *
 * Sozinha, cada família falha no que a outra resolve.
 */
export interface DiscoverySource {
  /** Vai para `JobSearchResult.source` e para a mensagem de falha na tela. */
  readonly name: string;

  /**
   * Prazo próprio, quando o padrão não serve. Fonte que faz uma requisição por
   * vaga precisa de bem mais fôlego que uma que devolve o board inteiro.
   */
  readonly deadlineMs?: number;

  fetch(query: DiscoveryQuery): Promise<JobSearchResult[]>;
}

export interface DiscoveryQuery {
  /** Texto livre. As fontes por busca usam; as por empresa ignoram. */
  q?: string;

  /**
   * Termos do perfil (`JobPreferences.searchTerms`), para quando a caixa de
   * texto está vazia. Ver `searchTermsFor`.
   */
  terms?: string[];

  /**
   * Empresas acompanhadas pelo perfil, já reconhecidas a partir dos endereços
   * em `JobPreferences.companyPages`. Ver `boardsFor`.
   */
  companies?: WatchedCompany[];

  /**
   * Busca ampliada: liga as fontes lentas, que leem portal página a página.
   * Opt-in porque custa segundos, não milissegundos.
   */
  expanded?: boolean;
}

/**
 * Os boards que uma fonte por empresa lê nesta rodada: os do `.env` somados
 * aos que o perfil acompanha na plataforma dela, sem repetir.
 */
export function boardsFor(
  query: DiscoveryQuery,
  platform: WatchedPlatform,
  fromEnv: readonly string[] = [],
): string[] {
  const fromProfile = (query.companies ?? [])
    .filter((company) => company.platform === platform)
    .map((company) => company.slug);

  return [...new Set([...fromEnv, ...fromProfile])];
}

/**
 * Os termos que uma fonte por busca deve consultar.
 *
 * O texto digitado vence: quem escreveu "clojure" quer clojure, não os termos
 * de sempre. Sem texto, valem os termos do perfil; sem eles, o padrão.
 */
export function searchTermsFor(query: DiscoveryQuery): string[] {
  const typed = query.q?.trim();

  if (typed) {
    return [typed];
  }

  const own = (query.terms ?? []).map((term) => term.trim()).filter(Boolean);

  return own.length > 0 ? own : DEFAULT_SEARCH_TERMS;
}

/**
 * Aplica um schema item a item, descartando o que não bate em vez de derrubar
 * a resposta inteira.
 *
 * É a forma prática da regra do §5: JSON de portal é dado externo, e um portal
 * que mude um campo não pode zerar a rodada. O que não valida some, e o
 * chamador registra quantos sumiram.
 */
export function parseEach<T>(
  items: unknown[],
  parse: (item: unknown) => T | null,
): { ok: T[]; dropped: number } {
  const ok: T[] = [];
  let dropped = 0;

  for (const item of items) {
    const parsed = parse(item);

    if (parsed === null) {
      dropped += 1;
      continue;
    }

    ok.push(parsed);
  }

  return { ok, dropped };
}
