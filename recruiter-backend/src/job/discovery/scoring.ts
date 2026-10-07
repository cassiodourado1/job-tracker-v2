import type { JobPreferences, JobSearchResult, JobSort } from '@recruit/shared';
import { fold } from './normalize';

/**
 * Aderência entre uma vaga e o seu currículo. Inteiro de 0 a 1000.
 *
 * Por código, não pelo modelo: seriam 20 chamadas por lote, para vagas que
 * você ainda nem leu. O score do Claude é para UMA vaga que já te interessou,
 * com o currículo inteiro no contexto (funcionalidade 4 do §1).
 *
 * A parte que não é óbvia é a **normalização por evidência**. As fontes não
 * entregam a mesma coisa: Ashby e Gupy trazem descrição, o que rende stack
 * detectada; um board sem descrição rende stack vazia. Somando pontos
 * absolutos, a vaga sem descrição perde sempre — não por ser pior, por ter
 * menos texto. Então cada sinal só entra na conta quando existe, e o total é
 * dividido pelo peso dos sinais que existiam.
 */

interface Signal {
  weight: number;
  /** `null` = a vaga não tem como responder a este sinal. */
  value: number | null;
}

/** Vaga publicada há mais de isto não recebe mais ponto por frescor. */
const FRESHNESS_WINDOW_DAYS = 45;

export function scoreJob(
  job: JobSearchResult,
  skills: string[],
  preferences: JobPreferences,
): number {
  const signals: Signal[] = [
    // Peso maior que o do currículo: stack marcada no filtro é escolha
    // explícita e recente; skill no currículo é histórico.
    { weight: 6, value: overlap(job.stack, preferences.stacks) },
    { weight: 5, value: overlap(job.stack, skills) },
    { weight: 3, value: titleAffinity(job.title, skills, preferences) },
    { weight: 2, value: seniorityFit(job.seniority, preferences) },
    { weight: 2, value: workModelFit(job.workModel, preferences) },
    { weight: 1, value: freshness(job.postedAt) },
  ];

  const present = signals.filter((signal) => signal.value !== null);

  if (present.length === 0) {
    return 0;
  }

  const total = present.reduce(
    (sum, signal) => sum + signal.weight * (signal.value ?? 0),
    0,
  );
  const divisor = present.reduce((sum, signal) => sum + signal.weight, 0);

  return Math.round((total / divisor) * 1000);
}

/**
 * Quantas das tecnologias procuradas a vaga pede — serve tanto para o filtro
 * quanto para as skills do currículo.
 *
 * Duas armadilhas aqui, e as duas foram medidas contra os portais reais.
 *
 * A primeira: PULAR o sinal quando a vaga não tem stack detectada fazia
 * "não sei nada sobre esta vaga" ganhar de "combina em parte". Uma vaga de
 * "Support Engineer, U.S. Government" sem descrição ficava acima de
 * "Senior Backend Engineer (Go)" para quem tem Go no currículo. Vaga sem
 * evidência recebe uma nota baixa explícita, não uma isenção.
 *
 * A segunda: dividir pelo tamanho da stack da vaga punia justamente a vaga bem
 * descrita — pedir Go, Kafka e mais três coisas que você não tem dava 0,2,
 * enquanto pedir só Go dava 1,0. O que importa é quantas das suas ela usa, e
 * três já é sinal suficiente.
 */
const NO_STACK_PRIOR = 0.25;
const SATURATION = 3;

function overlap(stack: string[], wanted: string[]): number | null {
  // Nada com que comparar: o sinal não distingue ninguém e sai da conta.
  if (wanted.length === 0) {
    return null;
  }

  if (stack.length === 0) {
    return NO_STACK_PRIOR;
  }

  const mine = new Set(wanted.map(fold));
  const hits = stack.filter((item) => mine.has(fold(item))).length;

  return Math.min(hits, SATURATION) / SATURATION;
}

/**
 * O título sozinho carrega sinal mesmo sem descrição — é o que impede uma vaga
 * de board sem `content` de ficar sem nenhuma evidência.
 */
function titleAffinity(
  title: string,
  skills: string[],
  preferences: JobPreferences,
): number {
  const value = fold(title);
  const bySkill = skills.some((skill) => value.includes(fold(skill)));
  const byPreference = preferences.titleIncludes.some((term) =>
    value.includes(fold(term)),
  );

  if (bySkill && byPreference) {
    return 1;
  }

  return bySkill || byPreference ? 0.6 : 0.2;
}

function seniorityFit(
  seniority: string | null,
  preferences: JobPreferences,
): number | null {
  if (!seniority || preferences.seniorities.length === 0) {
    return null;
  }

  return preferences.seniorities.includes(
    seniority as JobPreferences['seniorities'][number],
  )
    ? 1
    : 0;
}

function workModelFit(
  workModel: string | null,
  preferences: JobPreferences,
): number | null {
  if (!workModel || preferences.workModels.length === 0) {
    return null;
  }

  return preferences.workModels.includes(
    workModel as JobPreferences['workModels'][number],
  )
    ? 1
    : 0;
}

function freshness(postedAt: string | null): number | null {
  if (!postedAt) {
    return null;
  }

  const days = (Date.now() - new Date(postedAt).getTime()) / 86_400_000;

  if (Number.isNaN(days) || days < 0) {
    return null;
  }

  return Math.max(0, 1 - days / FRESHNESS_WINDOW_DAYS);
}

/**
 * Chave de ordenação, e também o cursor.
 *
 * Precisa ser um TOTAL ORDER estável entre requisições, porque o usuário
 * remove itens do meio do conjunto enquanto navega. Cada modo põe o seu
 * critério na frente; depois vem a pontuação decrescente (por isso
 * `1000 - score`) e, por último, a URL — duas vagas nunca empatam, então
 * nenhuma pode ser pulada nem repetida.
 *
 * As partes são separadas por `\u0001`, que é menor que qualquer caractere
 * imprimível: "acme" vem antes de "acme labs" porque o separador perde para
 * o espaço. Com ":" (58) seria o contrário, e a ordem alfabética erraria em
 * todo nome que é prefixo de outro.
 */
export function sortKey(
  job: JobSearchResult,
  score: number,
  sort: JobSort = 'relevancia',
): string {
  const tail = [String(1000 - score).padStart(4, '0'), job.url];

  switch (sort) {
    case 'recentes':
      return [recencyKey(job.postedAt), ...tail].join(SEPARATOR);
    case 'empresa':
      return [fold(job.company), ...tail].join(SEPARATOR);
    case 'cargo':
      return [fold(job.title), ...tail].join(SEPARATOR);
    default:
      return tail.join(SEPARATOR);
  }
}

const SEPARATOR = '\u0001';

/** Maior que qualquer data invertida: vaga sem data vai para o fim. */
const NO_DATE = '9'.repeat(15);

/**
 * Data decrescente como texto que ordena crescente: o complemento do
 * timestamp, com largura fixa para "10" não vir antes de "9".
 */
function recencyKey(postedAt: string | null): string {
  const time = postedAt ? new Date(postedAt).getTime() : NaN;

  if (Number.isNaN(time)) {
    return NO_DATE;
  }

  return String(1e14 - time).padStart(15, '0');
}
