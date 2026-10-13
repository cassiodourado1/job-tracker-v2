import { z } from 'zod';
import { resumeSchema } from './resume';

/**
 * Currículo adaptado para UMA vaga.
 *
 * O Claude reescreve o resumo e as descrições das experiências para dar
 * destaque ao que a vaga pede, e reordena as habilidades. Não acrescenta
 * nada: empresa, cargo, datas e formação vêm do currículo base, intocados, e
 * o servidor confere o texto novo contra o antigo (§4). A proposta volta para
 * a tela; só vira `ResumeVersion` quando você revisa e salva.
 */

export const tailorResumeRequestSchema = z.strictObject({
  profileId: z.string().min(1),
  jobId: z.string().min(1),
});

export type TailorResumeRequest = z.infer<typeof tailorResumeRequestSchema>;

export const tailoredResumeSchema = z.object({
  /** O currículo inteiro já com as mudanças: é o que se salva. */
  resume: resumeSchema,
  /** Antes e depois de cada parte que mudou, para a revisão. */
  changes: z.object({
    summary: z.object({
      before: z.string().nullable(),
      after: z.string().nullable(),
    }),
    experiences: z.array(
      z.object({
        index: z.number().int().min(0),
        company: z.string(),
        role: z.string(),
        before: z.string().nullable(),
        after: z.string(),
      }),
    ),
    skills: z.object({
      before: z.array(z.string()),
      after: z.array(z.string()),
    }),
  }),
  /** Cada afirmação do texto novo, e se o trecho citado existe no currículo. */
  facts: z.array(z.object({ claim: z.string(), grounded: z.boolean() })),
  /** O que a vaga pede e o currículo não mostra — e por isso NÃO foi incluído. */
  gaps: z.array(z.string()),
  /** Números do texto novo que não estão no currículo. */
  unverifiedNumbers: z.array(z.string()),
  /** Tecnologias citadas no texto novo que o currículo não menciona. */
  unknownTechs: z.array(z.string()),
  /** Vícios de texto de IA que sobraram, para você reescrever. */
  aiTells: z.array(z.string()),
});

export type TailoredResume = z.infer<typeof tailoredResumeSchema>;

/** O que você salvou depois de revisar — pode ter editado a proposta. */
export const saveTailoredResumeSchema = z.strictObject({
  profileId: z.string().min(1),
  jobId: z.string().min(1),
  resume: resumeSchema,
});

export type SaveTailoredResumeInput = z.infer<typeof saveTailoredResumeSchema>;

export const tailoredVersionSchema = z.object({
  id: z.string(),
  label: z.string(),
  createdAt: z.string(),
});

export type TailoredVersion = z.infer<typeof tailoredVersionSchema>;

/** A versão adaptada mais recente desta vaga, quando existe. */
export const tailoredVersionLookupSchema = z.object({
  version: tailoredVersionSchema.nullable(),
});

export type TailoredVersionLookup = z.infer<typeof tailoredVersionLookupSchema>;
