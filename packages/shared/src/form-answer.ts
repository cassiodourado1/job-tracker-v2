import { z } from 'zod';

/**
 * Responder uma pergunta de formulário de candidatura com base no seu
 * currículo e na vaga.
 *
 * Só gera: a resposta é um rascunho para você revisar, editar e copiar.
 * Nada é preenchido nem enviado em lugar nenhum.
 */

/**
 * `topics` é o padrão: a IA diz o que responder e com quais fatos, e você
 * escreve. É o modo em que a resposta final é sua de verdade — texto gerado
 * pelo Claude carrega a marca d'água estatística da Anthropic, e reescrever
 * com as suas palavras é o que a tira.
 */
export const answerModeSchema = z.enum(['topics', 'draft']);

export type AnswerMode = z.infer<typeof answerModeSchema>;

export const answerLanguageSchema = z.enum(['pt', 'en', 'es']);

export type AnswerLanguage = z.infer<typeof answerLanguageSchema>;

export const draftAnswerSchema = z
  .strictObject({
    profileId: z.string().min(1),
    /** Vaga salva no app. Sem ela, `jobText` descreve a vaga. */
    jobId: z.string().min(1).optional(),
    /** CONTEÚDO NÃO CONFIÁVEL: descrição de vaga colada. */
    jobText: z.string().trim().max(20_000).optional(),
    question: z.string().trim().min(3, 'Cole a pergunta').max(2_000),
    /** Tópicos seus, soltos: a matéria-prima que a IA costura. */
    notes: z.string().trim().max(2_000).optional(),
    maxChars: z.number().int().min(50).max(5_000).optional(),
    language: answerLanguageSchema.default('pt'),
    mode: answerModeSchema.default('topics'),
  })
  .refine((input) => input.jobId || input.jobText, {
    message: 'Informe a vaga: escolha uma salva ou cole a descrição.',
    path: ['jobText'],
  });

export type DraftAnswerInput = z.input<typeof draftAnswerSchema>;

export const answerTopicSchema = z.object({
  /** O que dizer. */
  point: z.string(),
  /** O fato do currículo ou das suas anotações que sustenta o ponto. */
  basis: z.string(),
});

export const answerFactSchema = z.object({
  /** A afirmação feita na resposta. */
  claim: z.string(),
  /** De onde saiu, em palavras: "experiência na Empresa X". */
  source: z.string(),
  /**
   * O servidor achou o trecho citado no seu currículo ou nas suas anotações.
   * Falso quer dizer que a afirmação pode ter sido inventada — a tela avisa.
   */
  grounded: z.boolean(),
});

export const answerDraftSchema = z.object({
  mode: answerModeSchema,
  /** No modo `topics`: o roteiro da resposta. */
  topics: z.array(answerTopicSchema),
  /** No modo `draft`: a resposta completa e uma versão curta. */
  draft: z.string().nullable(),
  short: z.string().nullable(),
  facts: z.array(answerFactSchema),
  /** O que a pergunta ou a vaga pede e o currículo não sustenta. */
  gaps: z.array(z.string()),
  /**
   * Números da resposta (anos, %, valores) que não aparecem no currículo nem
   * nas suas anotações. Número é o tipo de invenção mais perigoso numa
   * candidatura: parece fato e é checável.
   */
  unverifiedNumbers: z.array(z.string()),
  /** Expressões com cara de texto de IA que sobraram no rascunho. */
  aiTells: z.array(z.string()),
  /**
   * Itens da sua lista "não incluir" (histórico profissional) que apareceram
   * na resposta. Conferido pelo servidor. Com padrão, para a resposta valer
   * em quem não tem histórico.
   */
  excludedMentions: z.array(z.string()).default([]),
  /** Limite pedido e se o rascunho passou dele. */
  maxChars: z.number().int().nullable(),
  overLimit: z.boolean(),
});

export type AnswerDraft = z.infer<typeof answerDraftSchema>;
export type AnswerFact = z.infer<typeof answerFactSchema>;
export type AnswerTopic = z.infer<typeof answerTopicSchema>;
