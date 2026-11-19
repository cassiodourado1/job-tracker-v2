import { z } from 'zod';

/**
 * Análise de aderência: uma vaga salva contra o currículo do perfil.
 *
 * Responde "vale me candidatar, e como?": o que da vaga o currículo já mostra
 * (com o trecho que prova), o que falta e como contornar. A pontuação da
 * lista de descoberta é por código e serve para ordenar; esta é para UMA vaga
 * que já interessou, com o currículo inteiro no contexto (funcionalidade 4).
 */

/** Quem pediu a análise: o agente diário ou você, na tela. */
export const fitOriginSchema = z.enum(['agente', 'tela']);
export type FitOrigin = z.infer<typeof fitOriginSchema>;

export const jobFitRequestSchema = z.strictObject({
  profileId: z.string().min(1),
  jobId: z.string().min(1),
  /** Sem origem é a tela: o agente é o único que se identifica. */
  origin: fitOriginSchema.default('tela'),
});

export type JobFitRequest = z.infer<typeof jobFitRequestSchema>;

export const fitVerdictSchema = z.enum(['forte', 'boa', 'parcial', 'fraca']);
export type FitVerdict = z.infer<typeof fitVerdictSchema>;

export const gapSeveritySchema = z.enum(['bloqueia', 'importante', 'detalhe']);
export type GapSeverity = z.infer<typeof gapSeveritySchema>;

export const jobFitSchema = z.object({
  verdict: fitVerdictSchema,
  /** Duas ou três frases: o resumo para decidir. */
  summary: z.string(),
  strengths: z.array(
    z.object({
      /** O que a vaga pede. */
      requirement: z.string(),
      /** Onde isso aparece no currículo, nas palavras do próprio currículo. */
      evidence: z.string(),
      /**
       * O trecho citado existe mesmo no currículo — conferido pelo servidor,
       * sem IA. `false` não some da tela: aparece marcado para você conferir.
       */
      verified: z.boolean(),
    }),
  ),
  gaps: z.array(
    z.object({
      requirement: z.string(),
      severity: gapSeveritySchema,
      /** O que fazer: estudar, citar algo parecido, ou assumir na entrevista. */
      howToAddress: z.string(),
    }),
  ),
});

export type JobFit = z.infer<typeof jobFitSchema>;

/**
 * A análise guardada: a mesma, mais quando e quem pediu. É o que a página da
 * vaga mostra ao abrir, sem pagar de novo.
 */
export const storedJobFitSchema = jobFitSchema.extend({
  analyzedAt: z.iso.datetime(),
  origin: fitOriginSchema,
});

export type StoredJobFit = z.infer<typeof storedJobFitSchema>;
