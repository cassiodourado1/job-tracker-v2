"use client";

import { useOptimistic, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, MenuCheck, MenuChevron } from "@/components/menu";
import { APPLICATION_STATUSES } from "@recruit/shared";
import type { ApplicationStatus } from "@recruit/shared";
import { changeStatusAction } from "@/features/applications/actions";
import { statusTone } from "@/features/applications/components/status-badge";

interface StatusSelectProps {
  applicationId: string;
  status: ApplicationStatus;
  onError: (message: string) => void;
}

/** Cor do ponto de cada status, na mesma ordem de cores do badge. */
export const statusDot: Record<ApplicationStatus, string> = {
  rascunho: "bg-zinc-400 shadow-zinc-400/60",
  aplicado: "bg-sky-400 shadow-sky-400/60",
  triagem: "bg-indigo-400 shadow-indigo-400/60",
  entrevista: "bg-violet-400 shadow-violet-400/60",
  teste: "bg-amber-400 shadow-amber-400/60",
  oferta: "bg-emerald-400 shadow-emerald-400/60",
  rejeitado: "bg-red-400 shadow-red-400/60",
  cancelado: "bg-stone-400 shadow-stone-400/60",
};

const statusHint: Record<ApplicationStatus, string> = {
  rascunho: "ainda não enviada",
  aplicado: "enviada, sem resposta",
  triagem: "em análise pela empresa",
  entrevista: "conversa marcada",
  teste: "desafio técnico",
  oferta: "proposta recebida",
  rejeitado: "a empresa não seguiu com você",
  cancelado: "a vaga deixou de existir",
};

/**
 * Troca de status direto no card.
 *
 * É a ação mais frequente do dia a dia — "moveu para entrevista" — e precisa
 * continuar custando um clique para abrir e um para escolher.
 *
 * O menu em si — portal, teclado, posição na tela — é o `Menu` compartilhado.
 * Aqui fica só o que é do status: as cores do funil e a troca otimista.
 */
export function StatusSelect({
  applicationId,
  status,
  onError,
}: StatusSelectProps) {
  const [pending, startTransition] = useTransition();
  // O status novo aparece no clique; se o backend recusar, volta sozinho
  // quando a transição termina.
  const [shown, setShown] = useOptimistic(status);

  const choose = (next: ApplicationStatus) => {
    if (next === status) {
      return;
    }

    startTransition(async () => {
      setShown(next);
      const result = await changeStatusAction(applicationId, next);

      if (result.status === "error") {
        onError(result.message);
      }
    });
  };

  return (
    <Menu
      options={APPLICATION_STATUSES}
      getKey={identity}
      getText={identity}
      selectedKey={shown}
      onChoose={choose}
      label="Mudar status"
      // Rejeição e cancelamento não são degraus do funil: uma linha os separa
      // das etapas, como no painel. Uma linha só, antes do primeiro deles, e
      // os dois ficam juntos embaixo dela.
      separatorBefore={isRejection}
      renderTrigger={(trigger, open) => (
        <motion.button
          {...trigger}
          aria-label={`Status da candidatura: ${shown}`}
          disabled={pending}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          className={`group relative flex shrink-0 cursor-pointer items-center gap-2 overflow-hidden rounded-full border border-white/10 py-1 pl-2.5 pr-2 text-xs font-medium capitalize shadow-[0_6px_20px_-10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-wait ${statusTone[shown]}`}
        >
          <span className="relative flex size-2">
            {pending && (
              <span
                className={`absolute inset-0 animate-ping rounded-full opacity-75 ${statusDot[shown]}`}
              />
            )}
            <span
              className={`relative size-2 rounded-full shadow-[0_0_8px] ${statusDot[shown]}`}
            />
          </span>

          {/* O rótulo troca com um giro curto no eixo X: o status "vira a
              página", e o olho percebe que mudou mesmo sem ler. */}
          <span className="relative inline-grid [perspective:200px]">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={shown}
                initial={{ rotateX: -90, opacity: 0, y: 6 }}
                animate={{ rotateX: 0, opacity: 1, y: 0 }}
                exit={{ rotateX: 90, opacity: 0, y: -6 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="block [backface-visibility:hidden]"
              >
                {shown}
              </motion.span>
            </AnimatePresence>
          </span>

          <MenuChevron open={open} />
        </motion.button>
      )}
      renderOption={(option, { selected }) => (
        <div className="flex items-center gap-3">
          <span
            className={`size-2 shrink-0 rounded-full shadow-[0_0_10px] ${statusDot[option]}`}
          />

          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={`capitalize ${selected ? "font-semibold text-zinc-50" : "text-zinc-200"}`}
            >
              {option}
            </span>
            <span className="text-xs text-zinc-500">{statusHint[option]}</span>
          </span>

          {selected && <MenuCheck />}
        </div>
      )}
    />
  );
}

function identity(status: ApplicationStatus): ApplicationStatus {
  return status;
}

function isRejection(status: ApplicationStatus): boolean {
  return status === "rejeitado";
}
