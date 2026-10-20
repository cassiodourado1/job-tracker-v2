import Link from "next/link";
import type { ReactNode } from "react";
import { IconExternalLink } from "@/components/icons";
import {
  JobTags,
  StackTags,
  formatSalary,
} from "@/features/jobs/components/job-meta";
import type { Job } from "@/features/jobs/types";
import { openableJobUrl } from "@recruit/shared";
import { safeExternalUrl } from "@/lib/safe-url";

/** Server Component: é só leitura, nada aqui precisa de JS no cliente. */
export function JobDetail({ job }: { job: Job }) {
  const salary = formatSalary(job);
  const portalUrl = safeExternalUrl(job.url && openableJobUrl(job.url, job.title));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/vagas/salvas"
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Minhas vagas
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {job.company}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">{job.title}</p>
        </div>

        <JobTags job={job} />

        {salary && (
          <p className="text-lg font-medium text-emerald-700 dark:text-emerald-400">
            {salary}
          </p>
        )}

        {portalUrl && (
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-fit items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <IconExternalLink />
            Ver no portal
          </a>
        )}
      </header>

      {job.description && (
        <Section title="Descrição">
          {/*
            CONTEÚDO NÃO CONFIÁVEL: descrição vinda de portal externo. Renderiza
            como TEXTO, nunca como HTML — nada de dangerouslySetInnerHTML aqui.
            Ver seção 5 do CLAUDE.md.
          */}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {job.description}
          </p>
        </Section>
      )}

      {job.stack.length > 0 && (
        <Section title="Stack">
          <StackTags stack={job.stack} />
        </Section>
      )}

      {job.requirements.length > 0 && (
        <Section title="Requisitos">
          <List items={job.requirements} />
        </Section>
      )}

      {job.benefits.length > 0 && (
        <Section title="Benefícios">
          <List items={job.benefits} />
        </Section>
      )}

      <Section title="Registro">
        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Origem">{job.source ?? "—"}</Row>
          <Row label="Salva em">
            {new Date(job.createdAt).toLocaleDateString("pt-BR")}
          </Row>
        </dl>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex list-inside list-disc flex-col gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="capitalize">{children}</dd>
    </div>
  );
}
