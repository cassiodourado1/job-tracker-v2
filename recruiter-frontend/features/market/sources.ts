/**
 * Nome e cor de cada fonte no painel.
 *
 * A cor é da FONTE, não da posição no ranking: a Gupy é azul em qualquer
 * janela, mesmo quando cai para terceiro. As sete com posição são as que mais
 * trazem vagas; as demais somam em "Outras", cinza — uma nona cor não seria
 * distinguível das outras oito.
 */

const SLOTS: Record<string, number> = {
  gupy: 1,
  remotar: 2,
  nerdin: 3,
  "linkedin-alerts": 4,
  programathor: 5,
  empresas: 6,
  geekhunter: 7,
};

export const OTHER = "outras";

const LABELS: Record<string, string> = {
  gupy: "Gupy",
  remotar: "Remotar",
  nerdin: "Nerdin",
  "linkedin-alerts": "Alertas LinkedIn",
  programathor: "Programathor",
  empresas: "Páginas de empresas",
  geekhunter: "GeekHunter",
  remoteok: "RemoteOK",
  remotive: "Remotive",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  "portais-br": "Portais BR",
  [OTHER]: "Outras",
};

/** A fonte como o gráfico a agrupa: com cor própria, ou "outras". */
export function seriesOf(source: string): string {
  return source in SLOTS ? source : OTHER;
}

export function sourceColor(series: string): string {
  const slot = SLOTS[series];

  return slot ? `var(--series-${slot})` : "var(--series-other)";
}

export function sourceLabel(source: string): string {
  return LABELS[source] ?? source;
}

/** Ordem fixa das séries, para pilha e legenda não trocarem de lugar. */
export function seriesOrder(series: string[]): string[] {
  return [...new Set(series)].sort(
    (a, b) => (SLOTS[a] ?? 99) - (SLOTS[b] ?? 99),
  );
}

/** As que caíram em "Outras", para a legenda dizer quais são. */
export function otherSources(sources: string[]): string[] {
  return sources.filter((source) => !(source in SLOTS)).map(sourceLabel);
}
