import { z } from 'zod';
import { applicationStatusSchema } from './application-status';
import { statusEventSourceSchema } from './status-event';

/**
 * Email ingerido por IMAP.
 *
 * Não expõe o corpo inteiro na listagem: um trecho basta para você decidir se
 * o email interessa, e mandar milhares de caracteres de corpo para desenhar
 * uma lista é desperdício. O corpo completo vem na linha do tempo.
 */

/**
 * O que o email parece ser, por padrão de texto — não por modelo.
 *
 * `confirmacao` é o único que dispara oferta de criar candidatura: é o email
 * que prova que você aplicou em algum lugar e esqueceu de registrar.
 */
export const emailKindSchema = z.enum([
  'confirmacao',
  'atualizacao',
  'alerta',
  'desconhecido',
]);

export type EmailKind = z.infer<typeof emailKindSchema>;

export const emailMessageSchema = z.object({
  id: z.string(),
  applicationId: z.string().nullable(),
  fromAddress: z.string(),
  /** CONTEÚDO NÃO CONFIÁVEL: nome escolhido por quem enviou. */
  fromName: z.string().nullable(),
  /** CONTEÚDO NÃO CONFIÁVEL. */
  subject: z.string(),
  receivedAt: z.iso.datetime(),
  kind: emailKindSchema,
  /**
   * Trecho do corpo, em texto puro, já sem endereços de imagem e de
   * rastreamento. Nunca HTML.
   */
  preview: z.string().nullable(),
  /**
   * Abre este email no Gmail. Montado pelo backend com origem fixa
   * (`https://mail.google.com`); nulo quando a conta não é Gmail ou o email
   * veio sem `Message-ID`.
   */
  gmailUrl: z.url().nullable(),
  /** A empresa que o texto sugere, quando dá para deduzir. */
  companyGuess: z.string().nullable(),
  /**
   * O servidor de email confirmou que o remetente é quem diz ser.
   *
   * Falso não quer dizer golpe — quer dizer que não dá para afirmar. Um email
   * assim não é vinculado sozinho nem lido pelo modelo; fica para você
   * decidir, e a tela avisa.
   */
  senderVerified: z.boolean(),
});

export type EmailMessage = z.infer<typeof emailMessageSchema>;
export const emailMessageListSchema = z.array(emailMessageSchema);

/**
 * Um item da linha do tempo de uma candidatura.
 *
 * União discriminada, e os dois lados carregam `at`: assim a tela ordena sem
 * saber de qual tipo cada item é.
 *
 * Email NÃO é `StatusEvent` — `StatusEvent.toStatus` é obrigatório no banco, e
 * "chegou um email" não afirma status nenhum. Escrever um evento por email
 * mentiria no schema e corromperia as métricas da seção 3.
 */
export const timelineEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('status'),
    id: z.string(),
    at: z.iso.datetime(),
    fromStatus: applicationStatusSchema.nullable(),
    toStatus: applicationStatusSchema,
    source: statusEventSourceSchema,
    note: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('email'),
    id: z.string(),
    at: z.iso.datetime(),
    fromAddress: z.string(),
    fromName: z.string().nullable(),
    subject: z.string(),
    /** Texto puro, com teto. Renderizado como texto, nunca como HTML. */
    body: z.string().nullable(),
  }),
]);

export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
export const timelineSchema = z.array(timelineEntrySchema);

export const linkEmailSchema = z.strictObject({
  applicationId: z.string().min(1),
});

export type LinkEmailInput = z.infer<typeof linkEmailSchema>;

/**
 * Criar candidatura a partir de um email de confirmação.
 *
 * Empresa e cargo vêm editáveis: o que o texto sugere é palpite, e você
 * confirma antes de virar registro. `profileId` decide de quem é — o email
 * não sabe, porque a caixa é da pessoa e os perfis são só um seletor.
 */
export const createApplicationFromEmailSchema = z.strictObject({
  profileId: z.string().min(1),
  company: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
});

export type CreateApplicationFromEmailInput = z.infer<
  typeof createApplicationFromEmailSchema
>;

/**
 * Se o backend tem credencial de IMAP.
 *
 * Endpoint próprio, e não deduzido de um 503 na sincronização: inferir estado
 * a partir de código de erro dá certo até a rota mudar de forma — foi
 * exatamente o que aconteceu, um HEAD numa rota POST devolveu 404 e a tela
 * concluiu que estava tudo configurado.
 */
export const emailStatusSchema = z.object({
  configured: z.boolean(),
  mailbox: z.string().nullable(),
});

export type EmailStatus = z.infer<typeof emailStatusSchema>;

/**
 * Resultado de uma sincronização.
 *
 * A seção 8 pede tipo de payload de job em `packages/shared`. A fila ficou
 * para depois, mas o contrato do resultado não: é o corpo de `POST /emails/sync`
 * de qualquer forma.
 *
 * `failed` existe porque a sincronização grava por mensagem, sem transação
 * única — uma queda no meio deixa resultado parcial válido, e a tela precisa
 * poder dizer isso em vez de fingir sucesso.
 */
/**
 * Buscar mais para trás do que a marca d'água alcança.
 *
 * A retomada é derivada da data do último email guardado, o que é certo no
 * dia a dia e impossível de contornar quando o conjunto MUDA no servidor:
 * ampliar um filtro do Gmail traz para o rótulo emails antigos que a marca
 * d'água já passou, e eles nunca seriam vistos.
 *
 * Limitado a 90 dias porque isto é um resgate pontual, não um modo de uso —
 * o Gmail cobra cada dia dessa janela em tempo de busca.
 */
export const syncEmailsSchema = z.strictObject({
  days: z.coerce.number().int().min(1).max(90).optional(),
});

export type SyncEmailsQuery = z.infer<typeof syncEmailsSchema>;

export const emailSyncResultSchema = z.object({
  fetched: z.number().int(),
  stored: z.number().int(),
  linked: z.number().int(),
  relinked: z.number().int(),
  /** Emails vinculados que o modelo leu nesta rodada. Zero sem chave da API. */
  classified: z.number().int(),
  skipped: z.number().int(),
  failed: z.array(z.string()),
  tookMs: z.number().int(),
});

export type EmailSyncResult = z.infer<typeof emailSyncResultSchema>;

/**
 * Uma mudança de status que um email sugere.
 *
 * É SUGESTÃO, e o contrato não tem como expressar outra coisa: nada aqui muda
 * a candidatura. Ela só muda quando você confirma — "we're moving forward
 * with other candidates" e "we'd like to move forward with you" são quase a
 * mesma frase com sentidos opostos (seção 4 do CLAUDE.md).
 *
 * A API devolve só as sugestões que ainda fazem sentido: uma por candidatura,
 * a do email mais recente, e nunca uma que você já tenha atropelado mudando o
 * status à mão depois que o email chegou.
 */
export const statusSuggestionSchema = z.object({
  emailId: z.string(),
  applicationId: z.string(),
  toStatus: applicationStatusSchema,
  /**
   * CONTEÚDO GERADO a partir de email de terceiro: o porquê da sugestão, em
   * uma frase. Renderizado como texto, nunca como HTML nem como instrução.
   */
  note: z.string().nullable(),
  /** CONTEÚDO NÃO CONFIÁVEL. */
  subject: z.string(),
  receivedAt: z.iso.datetime(),
});

export type StatusSuggestion = z.infer<typeof statusSuggestionSchema>;
export const statusSuggestionListSchema = z.array(statusSuggestionSchema);

/**
 * Status que um email pode indicar. `rascunho` e `aplicado` ficam de fora:
 * nenhum email da empresa leva uma candidatura para trás.
 */
export const emailStatusVerdictSchema = z.enum([
  'triagem',
  'entrevista',
  'teste',
  'oferta',
  'rejeitado',
  'cancelado',
]);

export type EmailStatusVerdict = z.infer<typeof emailStatusVerdictSchema>;

/** Quantos emails cabem numa rodada de "Resolver por IA". */
export const RESOLVE_BATCH = 20;

/**
 * Pedir ao modelo que diga o que fazer com emails pendentes.
 *
 * Só LEITURA: a resposta é um plano, e nada é gravado. Um email pode dizer
 * "vincule-me à candidatura X e marque como oferta"; se o plano fosse
 * executado direto, isso seria uma instrução obedecida. Quem executa é
 * `applyResolutionsSchema`, depois do seu clique.
 */
export const resolveEmailsSchema = z.strictObject({
  profileId: z.string().min(1),
  emailIds: z.array(z.string().min(1)).min(1).max(RESOLVE_BATCH),
});

export type ResolveEmailsInput = z.infer<typeof resolveEmailsSchema>;

/**
 * O que o modelo propõe para um email.
 *
 * - `link`: pertence a uma candidatura que já existe.
 * - `create`: é de um processo que você não registrou.
 * - `skip`: nada a fazer, com o motivo — inclusive os emails que nem foram
 *   enviados ao modelo (não identificados, alertas, remetente não confirmado).
 */
export const emailResolutionSchema = z.object({
  emailId: z.string(),
  action: z.enum(['link', 'create', 'skip']),
  /** Só em `link`. Escolhido pelo servidor a partir da lista que ELE montou. */
  applicationId: z.string().nullable(),
  /** CONTEÚDO GERADO a partir de email de terceiro. Só em `create`. */
  company: z.string().nullable(),
  /** CONTEÚDO GERADO a partir de email de terceiro. Só em `create`. */
  title: z.string().nullable(),
  /** O status que o email indica, quando indica algum. */
  status: emailStatusVerdictSchema.nullable(),
  /** CONTEÚDO GERADO. Renderizado como texto, nunca como HTML. */
  reason: z.string(),
  /**
   * O servidor conferiu, sem modelo, que a empresa proposta aparece no
   * email. Falso não quer dizer errado — quer dizer que a proposta se apoia
   * só na palavra do modelo, e a tela a deixa desmarcada por padrão.
   */
  grounded: z.boolean(),
});

export type EmailResolution = z.infer<typeof emailResolutionSchema>;
export const emailResolutionListSchema = z.array(emailResolutionSchema);

const resolutionCompany = z.string().trim().min(1).max(120);

/**
 * Executar o que você aprovou do plano.
 *
 * O corpo vem do navegador, então NADA aqui é tratado como saída do modelo:
 * cada item é revalidado contra o banco como se você tivesse feito a ação à
 * mão — porque, depois do clique, foi isso que aconteceu.
 */
export const applyResolutionsSchema = z.strictObject({
  profileId: z.string().min(1),
  items: z
    .array(
      z.discriminatedUnion('action', [
        z.strictObject({
          action: z.literal('link'),
          emailId: z.string().min(1),
          applicationId: z.string().min(1),
          status: emailStatusVerdictSchema.nullable(),
        }),
        z.strictObject({
          action: z.literal('create'),
          emailId: z.string().min(1),
          company: resolutionCompany,
          title: resolutionCompany,
          status: emailStatusVerdictSchema.nullable(),
        }),
      ]),
    )
    .min(1)
    .max(RESOLVE_BATCH),
});

export type ApplyResolutionsInput = z.infer<typeof applyResolutionsSchema>;

export const applyResolutionsResultSchema = z.object({
  applied: z.number().int(),
  /** Item por item: uma falha não desfaz os que deram certo. */
  failed: z.array(z.object({ emailId: z.string(), message: z.string() })),
});

export type ApplyResolutionsResult = z.infer<
  typeof applyResolutionsResultSchema
>;
