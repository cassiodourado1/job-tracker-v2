import type { Metrics } from "@recruit/shared";
import { DashboardHeader, Panel, Tile } from "@/components/dashboard";
import { CountUp } from "@/components/motion";
import { AreaChart } from "./area-chart";
import { FunnelChart } from "./funnel-chart";
import { SourceYieldChart } from "./source-yield";

/**
 * O painel.
 *
 * Servidor, e os gráficos são os únicos clientes: só eles precisam de hover.
 * A fronteira fica neles e não aqui para o JSON das métricas não atravessar
 * para o bundle — a página continua sendo HTML pronto.
 *
 * O trabalho de verdade desta tela não são os números — é explicar os zeros.
 * Com quatro candidaturas todas em `aplicado`, o funil é `4 → 0 → 0 → 0` e
 * isso está CERTO. Zero sem explicação parece defeito, e o risco real é você
 * "consertar" o que não está quebrado.
 */
export function MetricsPanel({ metrics }: { metrics: Metrics }) {
  const moved = metrics.funnel.slice(1).some((step) => step.reached > 0);

  return (
    <div className="flex w-full flex-col gap-6">
      <DashboardHeader
        title="Métricas"
        subtitle="O que aconteceu depois que você se candidatou."
      />

      {metrics.active === 0 ? (
        <p className="cine-glass rounded-2xl px-6 py-14 text-center text-sm text-zinc-400">
          Sem candidaturas ativas. As métricas aparecem quando você registrar a
          primeira.
        </p>
      ) : (
        <>
          {metrics.active < metrics.minimumForRates && (
            <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-200 backdrop-blur-md">
              Base pequena: {metrics.active}{" "}
              {metrics.active === 1 ? "candidatura ativa" : "candidaturas ativas"}
              . Com poucos números, porcentagem vira ruído — por isso as taxas
              estão omitidas. Leia as contagens.
            </p>
          )}

          {/* Os números de cabeça, numa faixa só: numa tela larga cabem os
              oito lado a lado, e o olho lê a situação inteira de uma vez. */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4 2xl:grid-cols-8">
            <Tile index={0} label="Ativas" value={metrics.active} />
            <Tile index={1} label="Responderam" value={metrics.answered} hint="saíram de aplicado" />
            <Tile index={2} label="Rejeitadas" value={metrics.rejected} />
            <Tile index={3} label="Em rascunho" value={metrics.drafts} hint="ainda não enviadas" />
            <Tile
              index={4}
              label="Vagas recebidas"
              value={metrics.jobsSeen}
              hint={metrics.jobsSeen === 0 ? "começa na primeira busca" : "mostradas na descoberta"}
            />
            <Tile index={5} label="Salvas" value={metrics.jobsSaved} />
            <Tile index={6} label="Dispensadas" value={metrics.jobsDismissed} />
            <Tile
              index={7}
              label="Emails"
              value={metrics.emailsReceived}
              hint={`${metrics.emailsLinked} vinculados`}
            />
          </section>

          <div className="grid gap-5 xl:grid-cols-3">
            <Panel index={8} title="Funil" className="xl:col-span-2">
              <FunnelChart steps={metrics.funnel} />

              {!moved && (
                // "Sem dados" seria mentira: existe dado, e a resposta é zero.
                // A distinção é o ponto da tela inteira.
                <p className="text-xs text-zinc-400">
                  Nenhuma candidatura ativa passou de &quot;aplicado&quot; ainda.
                </p>
              )}

              {metrics.excluded > 0 && (
                // Você lembra de oito candidaturas e a tela diz quatro. Sem
                // esta linha, a tela certa parece quebrada.
                <p className="text-xs text-zinc-500">
                  Candidaturas excluídas não entram em nenhum número desta tela
                  ({metrics.excluded}{" "}
                  {metrics.excluded === 1 ? "excluída" : "excluídas"}).
                </p>
              )}
            </Panel>

            <ResponseTime
              medianDays={metrics.responseTime.medianDays}
              sample={metrics.responseTime.sample}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {metrics.emailsReceived > 0 && (
              <Panel
                index={10}
                title="Emails por dia"
                subtitle="O ritmo com que processo seletivo te procura."
              >
                <AreaChart
                  series={metrics.emailsByDay}
                  unit={{ one: "email", many: "emails" }}
                  title="Emails por dia"
                />
              </Panel>
            )}

            {metrics.jobsSeen > 0 && (
              <Panel
                index={11}
                title="Vagas recebidas por dia"
                subtitle={`Quantas vagas novas a descoberta te mostrou. A contagem começou em ${firstDay(metrics.jobsSeenByDay)} — antes disso a descoberta não guardava histórico.`}
              >
                {metrics.jobsSeenByDay.length >= 2 ? (
                  <AreaChart
                    series={metrics.jobsSeenByDay}
                    unit={{ one: "vaga", many: "vagas" }}
                    title="Vagas recebidas por dia"
                  />
                ) : (
                  // Um dia só não é série: seria um ponto solto, sem linha.
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-3 text-sm text-zinc-400">
                    {metrics.jobsSeen} vagas no primeiro dia de medição. O
                    gráfico aparece a partir do segundo dia.
                  </p>
                )}
              </Panel>
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {metrics.sourceYield.length > 0 && (
              <Panel
                index={12}
                title="O que cada fonte rendeu"
                subtitle="De quantas vagas mostradas você aproveitou alguma. Passe o mouse para ver a quebra."
              >
                <SourceYieldChart items={metrics.sourceYield} />
              </Panel>
            )}

            {metrics.bySource.length > 0 && (
              <Panel index={13} title="De onde vieram suas candidaturas">
                <SourceBars items={metrics.bySource} />
              </Panel>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Tempo até a primeira resposta.
 *
 * O número vem SEMPRE com a amostra ao lado. "5 dias" sobre uma resposta é um
 * caso, não um padrão — sem dizer de quantas saiu, a mediana aparenta uma
 * precisão que não tem.
 */
function ResponseTime({
  medianDays,
  sample,
}: {
  medianDays: number | null;
  sample: number;
}) {
  return (
    <section
      className="cine-reveal cine-glass relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl p-6"
      style={{ ["--i" as string]: 9 }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.72 0.19 292 / 0.35), transparent)",
        }}
      />
      <h2 className="text-base font-semibold">Tempo até a primeira resposta</h2>

      {medianDays === null ? (
        // Nulo e não zero: zero afirmaria uma resposta instantânea.
        <span className="text-sm text-zinc-400">
          Nenhuma empresa respondeu ainda.
        </span>
      ) : (
        <span className="flex flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <CountUp
              value={medianDays}
              decimals={Number.isInteger(medianDays) ? 0 : 1}
              className="bg-gradient-to-br from-white to-zinc-400 bg-clip-text font-[family-name:var(--font-display)] text-6xl font-semibold text-transparent"
            />
            <span className="text-lg text-zinc-400">
              {medianDays === 1 ? "dia" : "dias"}
            </span>
          </span>
          <span className="text-xs text-zinc-500">
            mediana de {sample} {sample === 1 ? "resposta" : "respostas"}
          </span>
        </span>
      )}

      <span className="text-xs text-zinc-500">
        Conta a partir da data real de cada mudança. Registrou atrasado? Corrija a
        data no histórico da candidatura.
      </span>
    </section>
  );
}

/**
 * `manual` é o que o sistema grava quando você colou um link ou criou a partir
 * de um email — não é um portal. Listar "manual" ao lado de "gupy" convidaria
 * a ler como se fosse origem, e a conclusão sobre de onde vêm suas melhores
 * vagas sairia errada.
 */
const sourceLabel: Record<string, string> = {
  manual: "manual (origem não registrada)",
  desconhecido: "desconhecida",
  "linkedin-alerts": "alerta LinkedIn",
  "portais-br": "portais BR",
};

function SourceBars({ items }: { items: { source: string; count: number }[] }) {
  const top = items[0]?.count ?? 0;

  return (
    <ol className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.source} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{sourceLabel[item.source] ?? item.source}</span>
            <span className="font-medium tabular-nums">{item.count}</span>
          </div>
          <div
            aria-hidden
            className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
          >
            <div
              className="h-full rounded-full bg-zinc-400 dark:bg-zinc-500"
              style={{ width: `${top === 0 ? 0 : (item.count / top) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * O primeiro dia com vaga registrada.
 *
 * A tela diz de quando a série começa porque, sem isso, os dias vazios antes
 * dela pareceriam dias sem vaga — quando na verdade não havia medição.
 */
function firstDay(series: { date: string; count: number }[]): string {
  const first = series.find((day) => day.count > 0);

  if (!first) {
    return "hoje";
  }

  return new Date(`${first.date}T12:00:00Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}
