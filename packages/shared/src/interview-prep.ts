import { z } from 'zod';

/**
 * Preparação para entrevista de UMA vaga.
 *
 * O Claude lê a vaga e o currículo e devolve as perguntas prováveis, com os
 * pontos de resposta tirados do SEU currículo, o que estudar antes e o que
 * perguntar à empresa. Fica guardada: é lida no dia da entrevista.
 */

export const interviewPrepRequestSchema = z.strictObject({
  profileId: z.string().min(1),
  jobId: z.string().min(1),
  /** A etapa, se você souber: "técnica com o tech lead", "RH", "case". */
  context: z.string().trim().max(1000).optional(),
});

export type InterviewPrepRequest = z.infer<typeof interviewPrepRequestSchema>;

export const interviewPrepLookupRequestSchema = z.strictObject({
  profileId: z.string().min(1),
  jobId: z.string().min(1),
});

export type InterviewPrepLookupRequest = z.infer<
  typeof interviewPrepLookupRequestSchema
>;

export const INTERVIEW_QUESTION_CATEGORIES = [
  'tecnica',
  'experiencia',
  'comportamental',
  'empresa',
] as const;

export const interviewQuestionCategorySchema = z.enum(
  INTERVIEW_QUESTION_CATEGORIES,
);

export type InterviewQuestionCategory = z.infer<
  typeof interviewQuestionCategorySchema
>;

export const interviewPrepSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      category: interviewQuestionCategorySchema,
      /** O que na vaga faz esta pergunta provável. */
      why: z.string(),
      /** Roteiro da resposta, cada ponto com base no currículo. */
      answerPoints: z.array(
        z.object({
          point: z.string(),
          /** O trecho citado existe no currículo ou no que você contou — conferido sem IA. */
          grounded: z.boolean(),
        }),
      ),
    }),
  ),
  /** O que a vaga pede e o currículo não mostra: revisar antes. */
  toStudy: z.array(z.object({ topic: z.string(), reason: z.string() })),
  /** Perguntas para você fazer, a partir do que a vaga diz (ou não diz). */
  questionsToAsk: z.array(z.string()),
  /** Números nos pontos de resposta que não estão no currículo. */
  unverifiedNumbers: z.array(z.string()),
});

export type InterviewPrep = z.infer<typeof interviewPrepSchema>;

export const savedInterviewPrepSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  context: z.string().nullable(),
  prep: interviewPrepSchema,
});

export type SavedInterviewPrep = z.infer<typeof savedInterviewPrepSchema>;

export const interviewPrepLookupSchema = z.object({
  prep: savedInterviewPrepSchema.nullable(),
});

export type InterviewPrepLookup = z.infer<typeof interviewPrepLookupSchema>;
