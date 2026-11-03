import { z } from 'zod';

/**
 * Estados brasileiros, pela sigla.
 *
 * Vocabulário fechado (§5): o estado é deduzido da localização em texto livre
 * que o portal escreve, e o que aparece no seletor é sempre uma destas 27
 * siglas — nunca o texto do portal.
 */
export const BRAZIL_STATES = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
} as const;

export type BrazilState = keyof typeof BRAZIL_STATES;

export const brazilStateSchema = z.enum(
  Object.keys(BRAZIL_STATES) as [BrazilState, ...BrazilState[]],
);

/**
 * Recorte por estado na tela de Vagas. `nao-informa`: a localização não diz o
 * estado ("Brasil", "Remoto", vazia) — mais da metade das vagas, medido, e por
 * isso precisa de opção própria em vez de sumir sem explicação.
 */
export const stateFilterSchema = z.enum([
  ...brazilStateSchema.options,
  'nao-informa',
]);

export type StateFilter = z.infer<typeof stateFilterSchema>;
