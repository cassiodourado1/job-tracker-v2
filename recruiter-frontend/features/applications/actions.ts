"use server";

import { revalidatePath } from "next/cache";
import {
  applicationStatusSchema,
  createApplicationSchema,
  updateApplicationSchema,
} from "@recruit/shared";
import type { ApplicationStatus, TimelineEntry } from "@recruit/shared";
import {
  ApiError,
  acceptSuggestion,
  createApplication,
  getTimeline,
  deleteApplication,
  dismissSuggestion,
  setEventDate,
  updateApplication,
} from "@/features/applications/api";
import type {
  ApplicationFormState,
  DeleteState,
} from "@/features/applications/types";

/** Campo vazio no formulário significa "não informado", não string vazia. */
function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const field = issue.path.join(".") || "form";
    fieldErrors[field] ??= issue.message;
  }

  return fieldErrors;
}

function toErrorState(error: unknown): ApplicationFormState {
  if (error instanceof ApiError) {
    return {
      status: "error",
      message: error.message,
      fieldErrors: error.issues
        ? Object.fromEntries(error.issues.map((i) => [i.field, i.message]))
        : undefined,
    };
  }

  return {
    status: "error",
    message: "Não foi possível falar com a API. Ela está no ar?",
  };
}

export async function createApplicationAction(
  _prev: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const parsed = createApplicationSchema.safeParse({
    profileId: formData.get("profileId"),
    company: formData.get("company"),
    title: formData.get("title"),
    url: optional(formData.get("url")),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Confira os campos.",
      fieldErrors: toFieldErrors(parsed.error.issues),
    };
  }

  try {
    const application = await createApplication(parsed.data);
    revalidatePath("/candidaturas");

    return { status: "success", application };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function updateApplicationAction(
  _prev: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const id = formData.get("id");

  if (typeof id !== "string" || id === "") {
    return { status: "error", message: "Candidatura não identificada." };
  }

  const url = optional(formData.get("url"));
  const notes = optional(formData.get("notes"));

  const parsed = updateApplicationSchema.safeParse({
    company: formData.get("company"),
    title: formData.get("title"),
    status: formData.get("status"),
    // `null` limpa o campo; o formulário vazio significa exatamente isso.
    url: url ?? null,
    notes: notes ?? null,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Confira os campos.",
      fieldErrors: toFieldErrors(parsed.error.issues),
    };
  }

  try {
    const application = await updateApplication(id, parsed.data);
    revalidatePath("/candidaturas");

    return { status: "success", application };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function deleteApplicationAction(id: string): Promise<DeleteState> {
  try {
    await deleteApplication(id);
    revalidatePath("/candidaturas");

    return { status: "success" };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Não foi possível excluir." };
  }
}

/**
 * Troca só o status, a partir da lista.
 *
 * Passa pelo mesmo `PATCH /applications/:id` do formulário, e portanto pelo
 * único método de serviço que altera `Application.status` — o StatusEvent sai
 * na mesma transação. Um atalho na UI não pode virar um atalho na regra.
 */
export async function changeStatusAction(
  id: string,
  status: ApplicationStatus,
): Promise<DeleteState> {
  const parsed = applicationStatusSchema.safeParse(status);

  if (!parsed.success) {
    return { status: "error", message: "Status inválido." };
  }

  try {
    await updateApplication(id, { status: parsed.data });
    revalidatePath("/candidaturas");
    revalidatePath("/vagas/salvas");

    return { status: "success" };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Não foi possível mudar o status." };
  }
}

export type TimelineState =
  | { status: "error"; message: string }
  | { status: "success"; entries: TimelineEntry[] };

/**
 * Carregada ao abrir o modal, e não junto com a lista: o histórico só interessa
 * de uma candidatura por vez, e buscá-lo para todas na página inicial custaria
 * uma consulta por linha para dado que quase nunca é aberto.
 */
export async function loadTimelineAction(id: string): Promise<TimelineState> {
  try {
    return { status: "success", entries: await getTimeline(id) };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Não consegui carregar o histórico." };
  }
}

/**
 * Corrige a data de uma transição.
 *
 * Recebe o dia como `AAAA-MM-DD` — é o que o `<input type="date">` entrega — e
 * grava ao meio-dia UTC: meia-noite num fuso negativo cairia no dia anterior,
 * e a entrevista de segunda apareceria como domingo.
 */
export async function setEventDateAction(
  applicationId: string,
  eventId: string,
  day: string,
): Promise<{ status: "success" } | { status: "error"; message: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { status: "error", message: "Data inválida." };
  }

  try {
    await setEventDate(applicationId, eventId, `${day}T12:00:00.000Z`);
    revalidatePath("/candidaturas");
    revalidatePath("/metricas");

    return { status: "success" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof ApiError ? error.message : "Não consegui salvar a data.",
    };
  }
}

/**
 * Confirma o que o email sugeriu. É o clique que a seção 4 exige: sem ele, a
 * leitura do modelo nunca vira status.
 */
export async function acceptSuggestionAction(
  emailId: string,
): Promise<DeleteState> {
  try {
    await acceptSuggestion(emailId);
    revalidatePath("/candidaturas");
    revalidatePath("/metricas");

    return { status: "success" };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Não foi possível confirmar." };
  }
}

export async function dismissSuggestionAction(
  emailId: string,
): Promise<DeleteState> {
  try {
    await dismissSuggestion(emailId);
    revalidatePath("/candidaturas");

    return { status: "success" };
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: "error", message: error.message };
    }

    return { status: "error", message: "Não foi possível dispensar." };
  }
}
