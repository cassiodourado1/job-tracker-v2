"use server";

import { revalidatePath } from "next/cache";
import {
  applyResolutionsSchema,
  createApplicationFromEmailSchema,
  resolveEmailsSchema,
} from "@recruit/shared";
import type {
  ApplyResolutionsResult,
  EmailResolution,
  EmailSyncResult,
} from "@recruit/shared";
import {
  ApiError,
  applyResolutions,
  createApplicationFromEmail,
  dismissEmail,
  linkEmail,
  resolveEmails,
  syncEmails,
  undismissEmail,
} from "@/features/emails/api";

export type EmailActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };

export type SyncState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; result: EmailSyncResult };

function toError(error: unknown, fallback: string): { status: "error"; message: string } {
  if (error instanceof ApiError) {
    return { status: "error", message: error.message };
  }

  return { status: "error", message: fallback };
}

export async function syncEmailsAction(): Promise<SyncState> {
  try {
    const result = await syncEmails();

    revalidatePath("/emails");

    return { status: "success", result };
  } catch (error) {
    return toError(error, "Não consegui sincronizar os emails agora.");
  }
}

export async function linkEmailAction(
  id: string,
  applicationId: string,
): Promise<EmailActionState> {
  try {
    await linkEmail(id, applicationId);
    revalidatePath("/emails");
    revalidatePath("/candidaturas");

    return { status: "success" };
  } catch (error) {
    return toError(error, "Não consegui vincular o email.");
  }
}

/**
 * Cria a candidatura que o email prova existir.
 *
 * Valida antes de chamar a API mesmo sabendo que o Nest revalida: é UX, dá o
 * erro no campo certo, e o §5 diz que isso não dispensa a borda.
 */
export async function createFromEmailAction(
  id: string,
  input: { profileId: string; company: string; title: string },
): Promise<EmailActionState> {
  const parsed = createApplicationFromEmailSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos",
    };
  }

  try {
    await createApplicationFromEmail(id, parsed.data);
    revalidatePath("/emails");
    revalidatePath("/candidaturas");

    return { status: "success" };
  } catch (error) {
    return toError(error, "Não consegui criar a candidatura.");
  }
}

/**
 * Tira o email da tela. Sem `revalidatePath` de propósito: o card vira uma
 * linha com "Desfazer" ali mesmo, e recarregar a lista o faria sumir antes
 * de dar tempo de desfazer um clique errado.
 */
export async function dismissEmailAction(id: string): Promise<EmailActionState> {
  try {
    await dismissEmail(id);

    return { status: "success" };
  } catch (error) {
    return toError(error, "Não consegui remover o email.");
  }
}

export async function undismissEmailAction(
  id: string,
): Promise<EmailActionState> {
  try {
    await undismissEmail(id);

    return { status: "success" };
  } catch (error) {
    return toError(error, "Não consegui desfazer.");
  }
}

export type ResolveState =
  | { status: "error"; message: string }
  | { status: "success"; plan: EmailResolution[] };

/**
 * Pede à IA um plano para os emails escolhidos. Só leitura: a lista não é
 * revalidada porque nada mudou — o plano ainda vai passar pelo seu clique.
 */
export async function resolveEmailsAction(
  profileId: string,
  emailIds: string[],
): Promise<ResolveState> {
  const parsed = resolveEmailsSchema.safeParse({ profileId, emailIds });

  if (!parsed.success) {
    return {
      status: "error",
      message: `Selecione de 1 a 20 emails por vez.`,
    };
  }

  try {
    return { status: "success", plan: await resolveEmails(parsed.data) };
  } catch (error) {
    return toError(error, "Não consegui consultar a IA agora.");
  }
}

export type ApplyState =
  | { status: "error"; message: string }
  | { status: "success"; result: ApplyResolutionsResult };

export async function applyResolutionsAction(
  input: unknown,
): Promise<ApplyState> {
  const parsed = applyResolutionsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Plano inválido.",
    };
  }

  try {
    const result = await applyResolutions(parsed.data);

    revalidatePath("/emails");
    revalidatePath("/candidaturas");
    revalidatePath("/metricas");

    return { status: "success", result };
  } catch (error) {
    return toError(error, "Não consegui aplicar o plano.");
  }
}
