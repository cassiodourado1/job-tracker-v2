import {
  careerHistorySchema,
  emptyCareerHistory,
  type CareerHistory,
} from '@recruit/shared';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * O histórico profissional como contexto do modelo, igual para todas as
 * features que usam o currículo: currículo adaptado, respostas de formulário,
 * aderência e preparação para entrevista.
 *
 * Num lugar só porque a regra é a mesma nas quatro: o histórico vale como o
 * currículo (§4: palavra sua, conferida sem IA), e a lista "não incluir" vale
 * para tudo o que sai em seu nome. Quatro cópias divergiriam na primeira
 * correção.
 *
 * A conferência da lista na volta (`excludedMentions`) mora no
 * `answer-plan.ts`, com as outras conferências de texto.
 */

/**
 * O histórico e a lista "não incluir", nas tags que os prompts descrevem.
 * `null` quando não há nada: um bloco vazio só gastaria cache e convidaria o
 * modelo a procurar o que não existe.
 *
 * A lista vai ao modelo mesmo sendo conferida na volta: o item que se quer
 * esconder costuma estar no próprio histórico, e sem a lista o modelo o
 * traria de boa-fé. A conferência é a garantia; a lista evita o retrabalho.
 */
export function historyBlock(history: CareerHistory): string | null {
  const parts: string[] = [];

  if (history.notes) {
    parts.push(`<historico>\n${history.notes}\n</historico>`);
  }

  if (history.exclude.length > 0) {
    parts.push(
      `<nao_incluir>\n${history.exclude.map((item) => `- ${item}`).join('\n')}\n</nao_incluir>`,
    );
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

/**
 * O bloco de `system` do histórico, para ir logo depois do `<curriculo>`.
 *
 * Com marcador de cache próprio: o histórico muda mais que o currículo, e
 * editar o histórico não deve invalidar o cache do bloco de cima. Sem
 * histórico, nenhum bloco, e a chamada fica igual à de antes.
 */
export function historySystemBlocks(history: CareerHistory) {
  const text = historyBlock(history);

  return text
    ? [
        {
          type: 'text' as const,
          text,
          cache_control: { type: 'ephemeral' as const },
        },
      ]
    : [];
}

/** O texto do histórico que a conferência sem IA aceita como fonte. */
export function historyText(history: CareerHistory): string {
  return history.notes ?? '';
}

/**
 * O histórico do perfil. Ilegível ou ausente vira vazio, e não erro: ele é um
 * extra, e cada feature funciona sem ele como funcionava antes.
 */
export async function loadCareerHistory(
  prisma: PrismaService,
  profileId: string,
): Promise<CareerHistory> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { careerHistory: true },
  });
  const history = careerHistorySchema.safeParse(profile?.careerHistory);

  return history.success ? history.data : emptyCareerHistory;
}
