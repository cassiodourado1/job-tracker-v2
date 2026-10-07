import "server-only";
import {
  createProfileSchema,
  profileDetailSchema,
  profileListSchema,
  profileSchema,
  resumeImportResultSchema,
  updateProfileSchema,
} from "@recruit/shared";
import type {
  CreateProfileInput,
  Profile,
  ProfileDetail,
  ResumeImportResult,
  UpdateProfileInput,
} from "@recruit/shared";
import { env } from "@/lib/env";

/**
 * Erro de comunicação com a API do Nest, já com o corpo que ela devolveu no
 * formato padronizado pelo AllExceptionsFilter.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${env.API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body as {
      message?: string;
      issues?: { field: string; message: string }[];
    } | null;

    throw new ApiError(
      detail?.message ?? `Falha na requisição (${response.status})`,
      response.status,
      detail?.issues,
    );
  }

  return body;
}

/**
 * A resposta é validada com o mesmo schema que o Nest usa. Do ponto de vista
 * do Next, o backend também é um sistema externo — se o contrato mudar de um
 * lado só, o erro aparece aqui e não numa tela quebrada.
 */
export async function listProfiles(): Promise<Profile[]> {
  return profileListSchema.parse(await request("/profiles"));
}

export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  const payload = createProfileSchema.parse(input);

  return profileSchema.parse(
    await request("/profiles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  );
}

export async function getProfileDetail(id: string): Promise<ProfileDetail> {
  return profileDetailSchema.parse(await request(`/profiles/${id}`));
}

export async function updateProfile(
  id: string,
  input: UpdateProfileInput,
): Promise<ProfileDetail> {
  return profileDetailSchema.parse(
    await request(`/profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updateProfileSchema.parse(input)),
    }),
  );
}

/**
 * Texto do currículo → currículo organizado, para revisão. O servidor tira
 * os dados pessoais antes de mandar ao modelo; nada é gravado.
 */
export async function importResumeText(
  id: string,
  text: string,
): Promise<ResumeImportResult> {
  return resumeImportResultSchema.parse(
    await request(`/profiles/${id}/resume/import`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  );
}
