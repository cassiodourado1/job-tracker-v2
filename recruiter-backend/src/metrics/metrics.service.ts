import { Injectable } from '@nestjs/common';
import type { ApplicationFacts, Metrics } from '@recruit/shared';
import { active } from '../application/active';
import { PrismaService } from '../prisma/prisma.service';
import { buildFunnel } from './funnel';
import { responseTime } from './response-time';
import { buildDailySeries, buildSourceYield, SERIES_DAYS } from './series';

/**
 * As métricas do painel.
 *
 * SEGUNDO leitor de `Application` no projeto. O `ApplicationService` comenta
 * que repetir a condição de soft delete bastava "enquanto este for o único
 * service que lê Application" — este arquivo é o momento em que deixou de
 * valer, e por isso `active` virou módulo próprio em vez de uma terceira
 * cópia. O §3 diz que candidatura apagada some das métricas, e hoje são 4 das
 * 8: esquecer a condição não dá erro, dá um número errado com cara de certo.
 */

/** Abaixo disto, percentual é ruído e o contrato devolve `null`. */
const MIN_FOR_RATES = 10;

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async forProfile(profileId: string): Promise<Metrics> {
    const [rows, excluded, seen, saved, jobsDismissed, emails] =
      await Promise.all([
        // `Application` é a RAIZ da consulta, e isso não é estilo.
        //
        // `StatusEvent` não tem `profileId` nem `deletedAt`, então consultá-lo
        // no topo exigiria `where: { application: { profileId, deletedAt:
        // null } }` — e funciona igual se você esquecer, contando em silêncio
        // as candidaturas apagadas. Descendo a partir daqui, os eventos de uma
        // candidatura apagada são inalcançáveis: o soft delete mora num
        // `where` só, e não há como esquecê-lo.
        //
        // Pelo mesmo motivo, NÃO usar `statusEvent.groupBy({ by: ['toStatus'] })`:
        // parece mais rápido e está errado.
        this.prisma.application.findMany({
          where: { profileId, ...active },
          select: {
            id: true,
            status: true,
            appliedAt: true,
            job: { select: { source: true, url: true } },
            statusEvents: { select: { toStatus: true, occurredAt: true } },
          },
        }),
        this.prisma.application.count({
          where: { profileId, deletedAt: { not: null } },
        }),
        // URL e fonte, não só a contagem: é o que permite cruzar o que foi
        // MOSTRADO com o que você salvou. Cresce ~2.000 linhas por ano, então
        // carregar tudo é barato; se um dia não for, vira agregação em SQL.
        this.prisma.discoveredJob.findMany({
          where: { profileId },
          select: { url: true, source: true, firstSeenAt: true },
        }),
        this.prisma.savedJob.findMany({
          where: { profileId },
          select: { job: { select: { url: true } } },
        }),
        this.prisma.dismissedJob.count({ where: { profileId } }),
        this.prisma.emailMessage.findMany({
          where: { profileId },
          select: { applicationId: true, receivedAt: true },
        }),
      ]);

    const facts: ApplicationFacts[] = rows.map((row) => ({
      applicationId: row.id,
      status: row.status,
      reached: row.statusEvents.map((event) => event.toStatus),
    }));

    return {
      funnel: buildFunnel(facts, MIN_FOR_RATES),
      rejected: rows.filter((row) => row.status === 'rejeitado').length,
      cancelled: rows.filter((row) => row.status === 'cancelado').length,
      drafts: rows.filter((row) => row.status === 'rascunho').length,
      active: rows.length,
      answered: facts.filter(answered).length,
      jobsSeen: seen.length,
      jobsSaved: saved.length,
      jobsDismissed,
      emailsReceived: emails.length,
      emailsLinked: emails.filter((email) => email.applicationId !== null)
        .length,
      bySource: countBySource(rows),
      sourceYield: buildSourceYield(
        seen,
        urls(saved.map((row) => row.job.url)),
        urls(rows.map((row) => row.job.url)),
      ),
      emailsByDay: buildDailySeries(
        emails.map((email) => email.receivedAt),
        SERIES_DAYS,
      ),
      jobsSeenByDay: buildDailySeries(
        seen.map((job) => job.firstSeenAt),
        measuredDays(seen.map((job) => job.firstSeenAt)),
      ),
      responseTime: responseTime(
        rows.map((row) => ({
          appliedAt: row.appliedAt,
          events: row.statusEvents,
        })),
      ),
      excluded,
      minimumForRates: MIN_FOR_RATES,
    };
  }
}

/**
 * A empresa respondeu: a candidatura saiu de `aplicado` alguma vez.
 *
 * Pelos eventos e não pelo status atual, senão quem avançou e voltou some.
 */
function answered(application: ApplicationFacts): boolean {
  return application.reached.some(
    (status) => status !== 'aplicado' && status !== 'rascunho',
  );
}

function countBySource(
  rows: { job: { source: string | null } }[],
): { source: string; count: number }[] {
  const tally = new Map<string, number>();

  for (const row of rows) {
    // Nulo vira `desconhecido`, NUNCA é filtrado fora: descartar faz o total
    // parar de fechar com `active` sem que nada acuse.
    //
    // E não vira `manual`: `manual` é o que o código grava quando VOCÊ colou um
    // link ou criou a partir de um email. Juntar os dois apagaria a diferença
    // entre "cadastrei à mão" e "a coluna estava vazia".
    const source = row.job.source ?? 'desconhecido';

    tally.set(source, (tally.get(source) ?? 0) + 1);
  }

  return [...tally.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

/** `Job.url` é anulável — vaga criada à mão pode não ter link. */
function urls(values: (string | null)[]): string[] {
  return values.filter((value): value is string => value !== null);
}

/**
 * Quantos dias a série de vagas cobre: do primeiro registro até hoje.
 *
 * A série de emails vai 60 dias para trás porque os emails EXISTEM nesse
 * período — zero lá é zero. A de vagas não: a descoberta não guardava
 * histórico antes da `DiscoveredJob`, e os dias anteriores ao primeiro
 * registro não são "dias sem vaga", são dias sem medição. Desenhá-los como
 * zero afirmaria algo que ninguém mediu.
 */
function measuredDays(dates: Date[]): number {
  if (dates.length === 0) {
    return 0;
  }

  const first = Math.min(...dates.map((date) => date.getTime()));
  const elapsed = Math.floor((Date.now() - first) / (24 * 60 * 60 * 1000));

  return Math.min(SERIES_DAYS, elapsed + 1);
}
