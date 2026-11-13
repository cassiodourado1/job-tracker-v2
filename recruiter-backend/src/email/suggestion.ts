import { APPLICATION_STATUSES, isClosedStatus } from '@recruit/shared';
import type { ApplicationStatus } from '@recruit/shared';

/**
 * Quais sugestões de status ainda valem a pena mostrar.
 *
 * O modelo lê o email e diz o que ele significa. Se isso ainda é notícia é
 * outra pergunta, e não é dele: depende do que aconteceu com a candidatura
 * depois que o email chegou. Função pura, porque é aqui que mora o erro que
 * não dá erro — uma sugestão velha pedindo para desfazer o que você já fez.
 */

export interface SuggestionFacts {
  emailId: string;
  applicationId: string;
  suggested: ApplicationStatus;
  receivedAt: Date;
  current: ApplicationStatus;
  /** Todos os eventos de status da candidatura, em qualquer ordem. */
  events: { toStatus: ApplicationStatus; occurredAt: Date }[];
}

/**
 * Status que só existem porque a empresa respondeu. Chegar a `rascunho` ou
 * `aplicado` é VOCÊ registrando a candidatura, e não reação a email nenhum.
 */
const RESPONSE: ReadonlySet<ApplicationStatus> = new Set([
  'triagem',
  'entrevista',
  'teste',
  'oferta',
  'rejeitado',
  'cancelado',
]);

export function isActionable(facts: SuggestionFacts): boolean {
  if (facts.suggested === facts.current) {
    return false;
  }

  // Encerrada. Reabrir um processo é raro o bastante para ser à mão.
  if (isClosedStatus(facts.current)) {
    return false;
  }

  // Você registrou uma resposta da empresa depois que o email chegou: já leu
  // a notícia.
  //
  // Só resposta conta. Marcar como `aplicado` logo depois de o email chegar é
  // a ordem normal — candidatou-se, a plataforma respondeu na hora, você
  // registrou em seguida —, e tratar isso como "já leu" escondia justamente
  // a primeira notícia de toda candidatura.
  const answeredAfter = facts.events.some(
    (event) =>
      RESPONSE.has(event.toStatus) && event.occurredAt >= facts.receivedAt,
  );

  if (answeredAfter) {
    return false;
  }

  // Um email antigo não puxa a candidatura para trás no funil. Rejeição e
  // cancelamento são a exceção: encerram a partir de qualquer etapa.
  if (
    !isClosedStatus(facts.suggested) &&
    depth(facts.suggested) <= depth(facts.current)
  ) {
    return false;
  }

  return true;
}

/**
 * Uma sugestão por candidatura: a do email mais recente que ainda vale.
 *
 * Filtra ANTES de escolher. Escolhendo primeiro, um email novo e irrelevante
 * esconderia um mais antigo que ainda é notícia.
 */
export function pickSuggestions<T extends SuggestionFacts>(rows: T[]): T[] {
  const newestFirst = [...rows].sort(
    (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime(),
  );
  const seen = new Set<string>();
  const picked: T[] = [];

  for (const row of newestFirst) {
    if (seen.has(row.applicationId) || !isActionable(row)) {
      continue;
    }

    seen.add(row.applicationId);
    picked.push(row);
  }

  return picked;
}

function depth(status: ApplicationStatus): number {
  return APPLICATION_STATUSES.indexOf(status);
}
