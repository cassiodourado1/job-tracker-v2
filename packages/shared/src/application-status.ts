import { z } from 'zod';

/**
 * Status de uma candidatura. A ordem reflete o fluxo esperado:
 * rascunho -> aplicado -> triagem -> entrevista -> teste -> oferta | rejeitado | cancelado
 *
 * `rejeitado` e `cancelado` podem acontecer a partir de qualquer estágio, por
 * isso não são passos lineares.
 *
 * São dois porque respondem perguntas diferentes. `rejeitado` é a empresa
 * decidindo não seguir com você (inclusive "a posição foi preenchida": alguém
 * foi escolhido no seu lugar). `cancelado` é a vaga deixando de existir sem
 * decisão nenhuma sobre você: cancelada, congelada, descontinuada. Juntar os
 * dois inflava as recusas e fazia o funil contar como derrota o que foi
 * orçamento cortado.
 */
export const applicationStatusSchema = z.enum([
  'rascunho',
  'aplicado',
  'triagem',
  'entrevista',
  'teste',
  'oferta',
  'rejeitado',
  'cancelado',
]);

export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const APPLICATION_STATUSES = applicationStatusSchema.options;

/** Status que encerram o processo: não têm próximo passo nem voltam sozinhos. */
export const CLOSED_STATUSES: readonly ApplicationStatus[] = [
  'rejeitado',
  'cancelado',
];

export function isClosedStatus(status: ApplicationStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}
