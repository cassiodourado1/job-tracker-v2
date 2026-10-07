import { z } from 'zod';
import {
  certificationSchema,
  educationSchema,
  experienceSchema,
  languageSchema,
  profileLinksSchema,
  projectSchema,
  resumeSchema,
} from './resume';

/**
 * Importar currículo a partir do texto de um PDF.
 *
 * O texto chega ao servidor, perde os dados pessoais (`redactResume`) e só o
 * resto vai ao modelo, que o organiza nas seções do currículo. Nada é gravado:
 * o resultado preenche o formulário para a pessoa revisar e salvar — a regra
 * "o modelo sugere, você decide" (§4).
 */

/** Abaixo disto o PDF é imagem escaneada, não texto. */
export const MIN_RESUME_TEXT = 200;
/** Currículo de três ou quatro páginas cabe folgado; o resto é ruído. */
export const MAX_RESUME_TEXT = 40_000;

export const importResumeSchema = z.strictObject({
  text: z.string().trim().min(MIN_RESUME_TEXT).max(MAX_RESUME_TEXT),
});

export type ImportResumeInput = z.infer<typeof importResumeSchema>;

/**
 * O que o modelo preenche. Sem data de nascimento e sem contatos: esses dados
 * nem chegam até ele.
 */
export const resumeExtractionSchema = z.object({
  /** Cargo e especialidade, como a pessoa se apresenta no topo. */
  headline: z.string().trim().max(120).nullable(),
  /** Cidade e estado, quando o currículo informa — acha vaga local. */
  location: z.string().trim().max(160).nullable(),
  summary: z.string().trim().max(4000).nullable(),
  experiences: z.array(experienceSchema),
  education: z.array(educationSchema),
  skills: z.array(z.string().trim().min(1).max(80)),
  projects: z.array(projectSchema),
  languages: z.array(languageSchema),
  certifications: z.array(certificationSchema),
});

export type ResumeExtraction = z.infer<typeof resumeExtractionSchema>;

export const resumeImportResultSchema = z.object({
  resume: resumeSchema,
  headline: z.string().nullable(),
  location: z.string().nullable(),
  /** Tirados do texto antes do modelo, e devolvidos direto. */
  email: z.string().nullable(),
  phone: z.string().nullable(),
  links: profileLinksSchema,
  /** O que NÃO foi enviado ao modelo, para a tela dizer. */
  removed: z.array(z.string()),
});

export type ResumeImportResult = z.infer<typeof resumeImportResultSchema>;
