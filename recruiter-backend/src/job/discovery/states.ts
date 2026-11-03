import type {
  BrazilState,
  JobSearchResult,
  StateFilter,
} from '@recruit/shared';
import { sameJobKey } from './grouping';
import { statesFromText } from './normalize';

/**
 * Recorte e contagem por estado da tela de Vagas.
 *
 * Decidido pela VAGA, não pelo anúncio: os anúncios iguais viram um card só
 * (`groupSameJob`), então a mesma posição anunciada em SP e em RJ é uma vaga
 * nos dois estados. Decidir pelo anúncio principal, como o painel faz com a
 * fonte, esconderia a vaga de quem escolheu RJ.
 */

function statesByJob(jobs: JobSearchResult[]): Map<string, Set<BrazilState>> {
  const byJob = new Map<string, Set<BrazilState>>();

  for (const job of jobs) {
    const key = sameJobKey(job);
    const states = byJob.get(key) ?? new Set<BrazilState>();

    for (const state of statesFromText(job.location)) {
      states.add(state);
    }

    byJob.set(key, states);
  }

  return byJob;
}

/**
 * Fica a vaga de qualquer um dos estados marcados ("ou"); nenhum marcado não
 * corta nada. Sem estado não passa por SP: foi a escolha, porque "passa quem
 * não informa" deixaria mais da metade da lista em qualquer estado. Quem quer
 * ver essas marca `nao-informa`.
 */
export function inState(
  jobs: JobSearchResult[],
  wanted: StateFilter[],
): JobSearchResult[] {
  if (wanted.length === 0) {
    return jobs;
  }

  const byJob = statesByJob(jobs);

  return jobs.filter((job) => {
    const states = byJob.get(sameJobKey(job))!;

    return wanted.some((state) =>
      state === 'nao-informa' ? states.size === 0 : states.has(state),
    );
  });
}

/**
 * Vagas por estado, da maior para a menor; empate pela sigla, para a ordem não
 * pular entre uma busca e outra. `nao-informa` sempre no fim: é o resto, não um
 * lugar, e no topo esconderia os estados de verdade.
 */
export function countByState(
  jobs: JobSearchResult[],
): { state: StateFilter; count: number }[] {
  const counts = new Map<BrazilState, number>();
  let undeclared = 0;

  for (const states of statesByJob(jobs).values()) {
    if (states.size === 0) {
      undeclared += 1;
    }

    for (const state of states) {
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }
  }

  const ranked: { state: StateFilter; count: number }[] = [...counts]
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));

  return undeclared > 0
    ? [...ranked, { state: 'nao-informa', count: undeclared }]
    : ranked;
}
