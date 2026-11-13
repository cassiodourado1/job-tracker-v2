import {
  FUNNEL_STAGES,
  type ApplicationFacts,
  type FunnelStep,
} from '@recruit/shared';

/**
 * O funil, a partir dos eventos de transição.
 *
 * Pura e sem I/O de propósito: é aqui que moram as decisões que erram em
 * silêncio — um número errado num painel continua parecendo um número.
 *
 * **Deriva do `StatusEvent`, não do `Application.status`.** A pergunta do §3 é
 * "quantas viraram entrevista?". Uma candidatura que fez
 * `aplicado → entrevista → teste → oferta` tem status atual `oferta`, e contar
 * só o status apagaria que ela passou por entrevista e por teste.
 *
 * **Mas o status atual entra no máximo junto.** Todo registro criado pela API
 * ganha um evento, então hoje os dois concordam. Linha criada por seed, por
 * migration futura ou direto no Studio não tem evento nenhum — e sem esta
 * linha ela sumiria do funil sem erro. É a defesa mais barata do arquivo.
 *
 * **Conta candidaturas distintas, nunca eventos.** Existe no banco real um
 * `rejeitado → rascunho → rejeitado`: contar eventos daria dois rejeitados
 * para uma candidatura só.
 *
 * **Conta profundidade máxima, não etapa exata.** Quem pula `triagem` e vai
 * direto para `entrevista` ainda conta em `triagem`, senão o funil cresce no
 * meio e a conversão passa de 100%.
 */
export function buildFunnel(
  applications: ApplicationFacts[],
  minimumForRates: number,
): FunnelStep[] {
  const depths = applications.map(deepestStage).filter((depth) => depth >= 0);

  // Abaixo do mínimo, percentual é ruído: "75% de conversão" sobre quatro
  // candidaturas afirma uma precisão que não existe. O corte é aqui, não na
  // tela, para que o frontend não CONSIGA imprimir o que é ruído.
  const rates = applications.length >= minimumForRates;

  return FUNNEL_STAGES.map((stage, index) => {
    const reached = depths.filter((depth) => depth >= index).length;
    const previous =
      index === 0 ? null : depths.filter((depth) => depth >= index - 1).length;

    return {
      stage,
      reached,
      // `null` e não zero quando não há de onde converter: 0% afirma que
      // ninguém passou, e "não havia ninguém" é outra coisa.
      conversion:
        !rates || previous === null || previous === 0
          ? null
          : reached / previous,
    };
  });
}

/**
 * O degrau mais fundo que esta candidatura alcançou. `-1` = nunca entrou.
 *
 * `rejeitado` e `rascunho` não são degraus: o primeiro acontece a partir de
 * QUALQUER etapa — incluí-lo faria uma candidatura rejeitada na triagem contar
 * como se tivesse chegado à oferta, porque `rejeitado` vem depois no enum — e
 * o segundo é anterior ao funil. `cancelado` fica fora pelo mesmo motivo que
 * `rejeitado`: o degrau que conta é o último alcançado antes de a vaga sumir.
 */
function deepestStage(application: ApplicationFacts): number {
  const marks = [...application.reached, application.status];

  let deepest = -1;

  for (const mark of marks) {
    const index = FUNNEL_STAGES.indexOf(mark as (typeof FUNNEL_STAGES)[number]);

    if (index > deepest) {
      deepest = index;
    }
  }

  return deepest;
}
