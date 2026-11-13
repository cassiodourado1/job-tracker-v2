import { z } from 'zod';
import { applicationStatusSchema } from './application-status';

/**
 * As métricas do painel.
 *
 * O §3 diz que o `StatusEvent` existe para responder "quantas viraram
 * entrevista?". Este contrato é essa resposta.
 */

/**
 * As etapas do funil, em ordem.
 *
 * Começa em `aplicado` e não em `rascunho`: candidatura criada já como
 * `aplicado` — que é o que o fluxo de email faz — nunca passa por `rascunho`,
 * e incluí-lo compararia coisas diferentes. `rascunho` vira indicador à parte.
 *
 * `rejeitado` também fica fora: ele acontece a partir de QUALQUER etapa, então
 * não é um degrau mais fundo que `oferta`. Vai reportado em separado.
 */
export const FUNNEL_STAGES = [
  'aplicado',
  'triagem',
  'entrevista',
  'teste',
  'oferta',
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const funnelStageSchema = z.enum(FUNNEL_STAGES);

export const funnelStepSchema = z.object({
  stage: funnelStageSchema,
  /**
   * Candidaturas que chegaram nesta etapa OU ALÉM.
   *
   * "Ou além" é o que torna o funil monotônico: quem pula `triagem` e vai
   * direto para `entrevista` ainda conta em `triagem`. Sem isso o funil
   * cresceria no meio e a conversão passaria de 100%.
   */
  reached: z.number().int().min(0),
  /**
   * Conversão desde a etapa anterior, de 0 a 1.
   *
   * `null` na primeira etapa, quando a anterior está zerada, e **quando não há
   * candidaturas suficientes** — ver `minimumForRates`. O corte vive aqui, no
   * contrato, e não na tela: assim o frontend fica impossibilitado de imprimir
   * um percentual que o backend considera ruído, e o limiar não pode divergir
   * entre os dois apps.
   */
  conversion: z.number().min(0).max(1).nullable(),
});

export type FunnelStep = z.infer<typeof funnelStepSchema>;

export const sourceCountSchema = z.object({
  /**
   * CONTEÚDO A INTERPRETAR COM CUIDADO: `manual` é o que o fluxo de email
   * grava quando não sabe a origem, não "cadastrei à mão".
   */
  source: z.string(),
  count: z.number().int().min(0),
});

/**
 * O que cada fonte rende, e não só quanto ela despeja.
 *
 * `seen` é o denominador que só passou a existir com a `DiscoveredJob`: antes
 * dava para saber quantas vagas você salvou, nunca DE QUANTAS. É a conta que
 * muda decisão — uma fonte que mostra 200 e rende 1 não vale o ruído.
 *
 * `saved` e `applied` contam apenas vagas que estão em `seen`. Sem esse
 * recorte, uma vaga salva antes desta tabela existir entraria no numerador e
 * nunca no denominador, e a taxa passaria de 100% sem nada acusar.
 */
export const sourceYieldSchema = z.object({
  source: z.string(),
  seen: z.number().int().min(0),
  saved: z.number().int().min(0),
  applied: z.number().int().min(0),
});

export type SourceYield = z.infer<typeof sourceYieldSchema>;

/** Um dia da série de emails. `date` é `AAAA-MM-DD`, sem hora. */
export const dayCountSchema = z.object({
  date: z.string(),
  count: z.number().int().min(0),
});

export type DayCount = z.infer<typeof dayCountSchema>;

export const metricsSchema = z.object({
  funnel: z.array(funnelStepSchema),

  /** Fora do funil: terminal a partir de qualquer etapa. */
  rejected: z.number().int().min(0),
  /**
   * Fora do funil e fora das recusas: a vaga deixou de existir sem decisão
   * sobre você. Separado de `rejected` para a recusa medir só recusa.
   */
  cancelled: z.number().int().min(0),
  /** Fora do funil: ainda não enviadas. */
  drafts: z.number().int().min(0),

  /** Candidaturas vivas, já descontado o soft delete. */
  active: z.number().int().min(0),
  /** Saíram de `aplicado` alguma vez — a empresa respondeu. */
  answered: z.number().int().min(0),

  /** Vagas que a descoberta chegou a te mostrar. Zero antes da primeira busca. */
  jobsSeen: z.number().int().min(0),
  jobsSaved: z.number().int().min(0),
  jobsDismissed: z.number().int().min(0),

  emailsReceived: z.number().int().min(0),
  emailsLinked: z.number().int().min(0),

  bySource: z.array(sourceCountSchema),

  /** Aproveitamento por fonte. Vazio até a descoberta registrar alguma coisa. */
  sourceYield: z.array(sourceYieldSchema),

  /**
   * Emails por dia, incluindo os dias sem nenhum.
   *
   * Dia vazio precisa vir como zero: uma série que pula dias desenha uma linha
   * que sobe onde não houve nada, e o gráfico mente sobre o ritmo.
   */
  emailsByDay: z.array(dayCountSchema),

  /**
   * Vagas mostradas pela descoberta, por dia de primeira aparição.
   *
   * Começa vazia: a descoberta não guardava histórico até a `DiscoveredJob`
   * existir. A série só cobre do dia em que ela passou a gravar.
   */
  jobsSeenByDay: z.array(dayCountSchema),

  /**
   * Tempo até a primeira resposta — do envio ao primeiro movimento da
   * empresa, recusa incluída.
   *
   * Mediana e não média, e sempre com o tamanho da amostra junto: "5 dias"
   * sobre uma resposta é um caso, não um padrão, e a tela precisa poder dizer.
   * `medianDays` é nulo quando ninguém respondeu ainda — zero afirmaria uma
   * resposta instantânea.
   */
  responseTime: z.object({
    medianDays: z.number().min(0).nullable(),
    sample: z.number().int().min(0),
  }),

  /**
   * Candidaturas apagadas, que NÃO entram em número nenhum desta tela (§3).
   *
   * Existe só para a tela poder dizer isso. Hoje são 4 de 8, e ver "4
   * candidaturas" lembrando de 8 parece defeito — a tela está certa, e
   * precisa conseguir explicar por quê.
   */
  excluded: z.number().int().min(0),

  /** Abaixo disto, `conversion` vem nula. Vai no payload para a tela explicar. */
  minimumForRates: z.number().int().positive(),
});

export type Metrics = z.infer<typeof metricsSchema>;

export const metricsQuerySchema = z.strictObject({
  profileId: z.string().min(1),
});

export type MetricsQuery = z.infer<typeof metricsQuerySchema>;

/** Só para o backend montar a entrada da função pura. */
export const applicationFactsSchema = z.object({
  applicationId: z.string(),
  /** Status ATUAL. Entra no máximo junto com os eventos — ver `buildFunnel`. */
  status: applicationStatusSchema,
  /** `toStatus` de todos os eventos desta candidatura. */
  reached: z.array(applicationStatusSchema),
});

export type ApplicationFacts = z.infer<typeof applicationFactsSchema>;
