/**
 * Triagem de graça, por código, sobre o que a busca do app já devolveu.
 *
 * A busca (`/jobs/discover`) já aplica o filtro do perfil: termos, título
 * exigido e proibido, tecnologias, modalidade, contrato, senioridade,
 * localização, idade dos alertas do LinkedIn, e tira o que você salvou,
 * aplicou ou descartou, com anúncios repetidos num card só. Aqui fica só o
 * que o agente acrescenta por cima: um corte de trilha pelo título e a idade
 * máxima da vaga.
 */

/** Vaga mais velha que isto já tem gente demais concorrendo. Sem data entra no fim. */
export const MAX_AGE_DAYS = 21;

/**
 * Corta o que é claramente de outra trilha (back-end em outra linguagem,
 * infra, dados, QA, mobile nativo), a não ser que o título também fale de
 * front-end: "Full Stack React/Java" passa, "Desenvolvedor Java" não.
 */
const OFF_TRACK =
  /(\.net|\bc#|\bjava\b(?!script)|python|golang|\bgo\b|ruby|rails|scala|elixir|rust|kotlin|swift|\bios\b|android|flutter|devops|\bsre\b|infra|platform engineer|cloud engineer|data (engineer|scien|analyst)|engenheir[oa] de dados|cientista de dados|analista de dados|machine learning|\bml\b|\bqa\b|quality|tester|testes|sap\b|salesforce|abap|cobol|mainframe|delphi|protheus|power bi|blockchain|solidity|embedded|embarcad|security|seguran|back-?\s?end|\bvb6?\b|visual basic|\brpa\b|hubspot|\bcrm\b|neg[oó]cios|banking|(?:\bai\b|\bia\b) engineer|engineer,? ai|desenvolvedor(?:\(a\))? de ia|llm)/i;
const FRONT_TRACK =
  /(front|react|next|vue|nuxt|angular|typescript|javascript|drupal|wordpress|\bui\b|web)/i;

export function onTrack(job) {
  return !OFF_TRACK.test(job.title) || FRONT_TRACK.test(job.title);
}

/** Até quando a vaga conta como nova. Sem data: conta, mas vem depois na busca. */
export function isFresh(job, now = Date.now()) {
  if (!job.postedAt) return true;
  return now - Date.parse(job.postedAt) <= MAX_AGE_DAYS * 86_400_000;
}
