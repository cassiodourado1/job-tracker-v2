"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { ageFromBirthDate, emptyResume } from "@recruit/shared";
import type {
  Certification,
  Education,
  Experience,
  Language,
  Project,
  ProfileDetail,
  ProfileLinks,
  Resume,
  ResumeImportResult,
} from "@recruit/shared";
import { Field } from "@/components/field";
import { saveProfileAction } from "@/features/profile/actions";
import { LinkedInImportCard } from "@/features/profile/components/linkedin-import-card";
import { ResumePdfImportCard } from "@/features/profile/components/resume-pdf-import-card";
import { SectionList } from "@/features/profile/components/section-list";
import type { ImportOutcome } from "@/features/profile/linkedin-import";

interface Personal {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: ProfileLinks;
}

export function ResumeForm({ profile }: { profile: ProfileDetail }) {
  const [personal, setPersonal] = useState<Personal>({
    name: profile.name,
    headline: profile.headline ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    location: profile.location ?? "",
    links: profile.links,
  });
  const [resume, setResume] = useState<Resume>(profile.resume ?? emptyResume);
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "erro"; message: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const age = ageFromBirthDate(resume.birthDate);

  // O import preenche o formulário; gravar continua sendo decisão sua.
  //
  // Mescla em vez de substituir: o export do LinkedIn não traz data de
  // nascimento nem projetos, e sobrescrever o currículo inteiro apagaria esses
  // campos em silêncio. Só o que o export realmente carrega é trocado.
  const applyImport = useCallback((outcome: ImportOutcome) => {
    setResume((current) => ({
      ...outcome.resume,
      birthDate: current.birthDate,
      projects: current.projects,
      summary: outcome.resume.summary ?? current.summary,
    }));
    setPersonal((current) => ({
      ...current,
      headline: outcome.headline ?? current.headline,
      location: outcome.location ?? current.location,
    }));
    setFeedback(null);
  }, []);

  // Do PDF vem o currículo inteiro, então as seções são trocadas — mas o que
  // o PDF não trouxe fica: a data de nascimento nunca vem (não vai ao modelo),
  // e seção vazia no PDF não apaga a que você já preencheu. Nos dados
  // pessoais, campo vazio no resultado não apaga o que já estava escrito.
  const applyResumeImport = useCallback((result: ResumeImportResult) => {
    setResume((current) => {
      const keep = <K extends keyof Resume>(key: K): Resume[K] => {
        const imported = result.resume[key];

        return Array.isArray(imported) && imported.length === 0
          ? current[key]
          : imported;
      };

      return {
        birthDate: current.birthDate,
        summary: result.resume.summary ?? current.summary,
        experiences: keep("experiences"),
        education: keep("education"),
        skills: keep("skills"),
        projects: keep("projects"),
        languages: keep("languages"),
        certifications: keep("certifications"),
      };
    });
    setPersonal((current) => ({
      ...current,
      headline: result.headline ?? current.headline,
      location: result.location ?? current.location,
      email: result.email ?? current.email,
      phone: result.phone ?? current.phone,
      links: {
        linkedin: result.links.linkedin ?? current.links.linkedin,
        github: result.links.github ?? current.links.github,
        website: result.links.website ?? current.links.website,
      },
    }));
    setFeedback(null);
  }, []);

  const save = () => {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveProfileAction(profile.id, {
        name: personal.name,
        headline: personal.headline || null,
        email: personal.email || null,
        phone: personal.phone || null,
        location: personal.location || null,
        links: personal.links,
        resume,
      });

      if (result.status === "success") {
        setFeedback({ kind: "ok", message: "Currículo salvo." });

        return;
      }

      if (result.status === "error") {
        // Mostra o campo junto da mensagem: "resume.experiences.0.company" diz
        // exatamente qual item da lista está incompleto.
        const detail = Object.entries(result.fieldErrors ?? {})
          .map(([field, message]) => `${field}: ${message}`)
          .join(" · ");

        setFeedback({ kind: "erro", message: detail || result.message });
      }
    });
  };

  const patch = <K extends keyof Resume>(key: K, value: Resume[K]) =>
    setResume((current) => ({ ...current, [key]: value }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Currículo</h1>
          <Link
            href="/curriculo/imprimir"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Ver e salvar PDF
          </Link>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </div>

      {feedback && (
        <p
          role="alert"
          className={`text-sm ${feedback.kind === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
        >
          {feedback.message}
        </p>
      )}

      <ResumePdfImportCard
        profileId={profile.id}
        onImported={applyResumeImport}
      />

      <LinkedInImportCard onImported={applyImport} />

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Dados pessoais</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Nome"
            value={personal.name}
            onValueChange={(v) => setPersonal({ ...personal, name: v })}
          />
          <Field
            label="Título"
            placeholder="Backend Sênior"
            value={personal.headline}
            onValueChange={(v) => setPersonal({ ...personal, headline: v })}
          />
          <Field
            label={
              age === null ? "Data de nascimento" : `Data de nascimento (${age} anos)`
            }
            type="date"
            value={resume.birthDate ?? ""}
            onValueChange={(v) => patch("birthDate", v || null)}
          />
          <Field
            label="Local"
            placeholder="São Paulo, SP"
            value={personal.location}
            onValueChange={(v) => setPersonal({ ...personal, location: v })}
          />
          <Field
            label="Email"
            type="email"
            value={personal.email}
            onValueChange={(v) => setPersonal({ ...personal, email: v })}
          />
          <Field
            label="Telefone"
            type="tel"
            value={personal.phone}
            onValueChange={(v) => setPersonal({ ...personal, phone: v })}
          />
          <Field
            label="LinkedIn"
            type="url"
            placeholder="https://linkedin.com/in/…"
            value={personal.links.linkedin ?? ""}
            onValueChange={(v) =>
              setPersonal({
                ...personal,
                links: { ...personal.links, linkedin: v || null },
              })
            }
          />
          <Field
            label="GitHub"
            type="url"
            placeholder="https://github.com/…"
            value={personal.links.github ?? ""}
            onValueChange={(v) =>
              setPersonal({
                ...personal,
                links: { ...personal.links, github: v || null },
              })
            }
          />
        </div>
        <Field
          label="Resumo"
          multiline
          placeholder="Dois ou três parágrafos sobre você"
          value={resume.summary ?? ""}
          onValueChange={(v) => patch("summary", v || null)}
        />
      </section>

      <SectionList<Experience>
        title="Experiências"
        items={resume.experiences}
        onChange={(items) => patch("experiences", items)}
        addLabel="Adicionar"
        emptyLabel="Nenhuma experiência ainda."
        emptyItem={() => ({
          company: "",
          role: "",
          location: null,
          startDate: null,
          endDate: null,
          current: false,
          description: null,
        })}
        renderItem={(item, update) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Empresa"
                value={item.company}
                onValueChange={(v) => update({ company: v })}
              />
              <Field
                label="Cargo"
                value={item.role}
                onValueChange={(v) => update({ role: v })}
              />
              <Field
                label="Início (AAAA-MM)"
                type="month"
                value={item.startDate ?? ""}
                onValueChange={(v) => update({ startDate: v || null })}
              />
              <Field
                label="Fim (vazio = atual)"
                type="month"
                value={item.endDate ?? ""}
                onValueChange={(v) =>
                  update({ endDate: v || null, current: !v })
                }
              />
            </div>
            <Field
              label="Descrição"
              multiline
              value={item.description ?? ""}
              onValueChange={(v) => update({ description: v || null })}
            />
          </>
        )}
      />

      <SectionList<Education>
        title="Formação"
        items={resume.education}
        onChange={(items) => patch("education", items)}
        addLabel="Adicionar"
        emptyLabel="Nenhuma formação ainda."
        emptyItem={() => ({
          school: "",
          degree: null,
          field: null,
          startDate: null,
          endDate: null,
        })}
        renderItem={(item, update) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Instituição"
              value={item.school}
              onValueChange={(v) => update({ school: v })}
            />
            <Field
              label="Curso"
              value={item.degree ?? ""}
              onValueChange={(v) => update({ degree: v || null })}
            />
            <Field
              label="Início"
              type="month"
              value={item.startDate ?? ""}
              onValueChange={(v) => update({ startDate: v || null })}
            />
            <Field
              label="Fim"
              type="month"
              value={item.endDate ?? ""}
              onValueChange={(v) => update({ endDate: v || null })}
            />
          </div>
        )}
      />

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Competências</h2>
        <Field
          label="Uma por linha"
          multiline
          placeholder={"Go\nKafka\nPostgreSQL"}
          value={resume.skills.join("\n")}
          onValueChange={(v) =>
            patch(
              "skills",
              v.split("\n").map((s) => s.trim()).filter(Boolean),
            )
          }
        />
      </section>

      <SectionList<Project>
        title="Projetos"
        items={resume.projects}
        onChange={(items) => patch("projects", items)}
        addLabel="Adicionar"
        emptyLabel="Nenhum projeto ainda."
        emptyItem={() => ({ name: "", url: null, description: null })}
        renderItem={(item, update) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Nome"
                value={item.name}
                onValueChange={(v) => update({ name: v })}
              />
              <Field
                label="Link"
                type="url"
                value={item.url ?? ""}
                onValueChange={(v) => update({ url: v || null })}
              />
            </div>
            <Field
              label="Descrição"
              multiline
              value={item.description ?? ""}
              onValueChange={(v) => update({ description: v || null })}
            />
          </>
        )}
      />

      <SectionList<Language>
        title="Idiomas"
        items={resume.languages}
        onChange={(items) => patch("languages", items)}
        addLabel="Adicionar"
        emptyLabel="Nenhum idioma ainda."
        emptyItem={() => ({ name: "", level: null })}
        renderItem={(item, update) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Idioma"
              value={item.name}
              onValueChange={(v) => update({ name: v })}
            />
            <Field
              label="Nível"
              value={item.level ?? ""}
              onValueChange={(v) => update({ level: v || null })}
            />
          </div>
        )}
      />

      <SectionList<Certification>
        title="Certificações"
        items={resume.certifications}
        onChange={(items) => patch("certifications", items)}
        addLabel="Adicionar"
        emptyLabel="Nenhuma certificação ainda."
        emptyItem={() => ({ name: "", issuer: null, date: null })}
        renderItem={(item, update) => (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Nome"
              value={item.name}
              onValueChange={(v) => update({ name: v })}
            />
            <Field
              label="Emissor"
              value={item.issuer ?? ""}
              onValueChange={(v) => update({ issuer: v || null })}
            />
            <Field
              label="Data"
              type="month"
              value={item.date ?? ""}
              onValueChange={(v) => update({ date: v || null })}
            />
          </div>
        )}
      />
    </div>
  );
}
