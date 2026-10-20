"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { APPLICATION_STATUSES, openableJobUrl } from "@recruit/shared";
import { Field } from "@/components/field";
import {
  createApplicationAction,
  updateApplicationAction,
} from "@/features/applications/actions";
import { StatusBadge } from "@/features/applications/components/status-badge";
import { ApplicationTimeline } from "@/features/applications/components/application-timeline";
import type {
  Application,
  ApplicationFormState,
} from "@/features/applications/types";
import { safeExternalUrl } from "@/lib/safe-url";

export type ModalEntry =
  | { mode: "create" }
  | { mode: "view"; application: Application }
  | { mode: "edit"; application: Application };

interface ApplicationModalProps {
  entry: ModalEntry | null;
  open: boolean;
  profileId: string;
  onClose: () => void;
  onEdit: (application: Application) => void;
}

const idle: ApplicationFormState = { status: "idle" };

export function ApplicationModal({
  entry,
  open,
  profileId,
  onClose,
  onEdit,
}: ApplicationModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [createState, createAction, creating] = useActionState(
    createApplicationAction,
    idle,
  );
  const [updateState, updateAction, updating] = useActionState(
    updateApplicationAction,
    idle,
  );

  const isCreate = entry?.mode === "create";
  const state = isCreate ? createState : updateState;
  const formAction = isCreate ? createAction : updateAction;
  const pending = isCreate ? creating : updating;

  // O <dialog> fica montado e só alterna aberto/fechado. Desmontar ao fechar
  // removeria o nó no primeiro quadro e não haveria o que animar na saída.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    // `cancel` (Esc) não borbulha; a delegação do React não o pega de forma
    // confiável. Aqui o modal sempre pode fechar — há a lista atrás.
    const handleCancel = () => onClose();

    dialog.addEventListener("cancel", handleCancel);

    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  useEffect(() => {
    if (state.status === "success") {
      onClose();
    }
  }, [state, onClose]);

  const application = entry && "application" in entry ? entry.application : null;

  return (
    <dialog
      ref={dialogRef}
      data-animated
      className="m-auto w-[min(92vw,32rem)] rounded-2xl border border-zinc-200 bg-white p-8 text-zinc-900 shadow-xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
    >
      {entry?.mode === "view" && application ? (
        <ViewMode application={application} onEdit={() => onEdit(application)} onClose={onClose} />
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {isCreate ? "Nova candidatura" : "Editar candidatura"}
          </h2>

          {isCreate ? (
            <input type="hidden" name="profileId" value={profileId} />
          ) : (
            <input type="hidden" name="id" value={application?.id ?? ""} />
          )}

          <Field
            label="Empresa"
            name="company"
            placeholder="Ex.: Empresa Exemplo"
            required
            autoFocus
            defaultValue={application?.job.company}
            error={state.status === "error" ? state.fieldErrors?.company : undefined}
          />
          <Field
            label="Cargo"
            name="title"
            placeholder="Backend Sênior"
            required
            defaultValue={application?.job.title}
            error={state.status === "error" ? state.fieldErrors?.title : undefined}
          />
          <Field
            label="Link da vaga"
            name="url"
            type="url"
            placeholder="https://… (opcional)"
            defaultValue={application?.job.url ?? undefined}
            error={state.status === "error" ? state.fieldErrors?.url : undefined}
          />

          {!isCreate && (
            <>
              <Field label="Status" name="status" defaultValue={application?.status}>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Field>
              <Field
                label="Notas"
                name="notes"
                multiline
                placeholder="O que você quer lembrar sobre esta vaga"
                defaultValue={application?.notes ?? undefined}
                error={state.status === "error" ? state.fieldErrors?.notes : undefined}
              />
            </>
          )}

          {state.status === "error" && !state.fieldErrors && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.message}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
            <button
              type="submit"
              disabled={pending}
              className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {pending ? "Salvando…" : isCreate ? "Registrar" : "Salvar"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/**
 * Ver e editar são o mesmo modal, com estados diferentes. Dois componentes
 * mostrando os mesmos dados divergiriam com o tempo.
 */
function ViewMode({
  application,
  onEdit,
  onClose,
}: {
  application: Application;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { job } = application;
  const portalUrl = safeExternalUrl(job.url && openableJobUrl(job.url, job.title));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{job.company}</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{job.title}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      <dl className="flex flex-col gap-3 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
        <Row label="Link">
          {portalUrl ? (
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
            >
              {job.url}
            </a>
          ) : (
            <Empty />
          )}
        </Row>
        <Row label="Senioridade">{job.seniority ?? <Empty />}</Row>
        <Row label="Modalidade">{job.workModel ?? <Empty />}</Row>
        <Row label="Local">{job.location ?? <Empty />}</Row>
        <Row label="Registrada em">
          {new Date(application.createdAt).toLocaleDateString("pt-BR")}
        </Row>
        <Row label="Notas">
          {application.notes ? (
            <span className="whitespace-pre-wrap">{application.notes}</span>
          ) : (
            <Empty />
          )}
        </Row>
      </dl>

      <ApplicationTimeline key={application.id} applicationId={application.id} />

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/vagas/${job.id}`}
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Ver a vaga
        </Link>

        <div className="flex gap-2">
        <SecondaryButton onClick={onClose}>Fechar</SecondaryButton>
        <button
          type="button"
          onClick={onEdit}
          className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Editar
        </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Empty() {
  return <span className="text-zinc-400 dark:text-zinc-600">—</span>;
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
    >
      {children}
    </button>
  );
}
