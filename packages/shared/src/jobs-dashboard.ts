import { z } from 'zod';
import { workModelSchema } from './job';

/**
 * Painel do mercado: as vagas que passam nos SEUS filtros, publicadas numa
 * janela de tempo, contadas por fonte, empresa, modalidade e tecnologia.
 *
 * É foto do que os portais têm agora, não histórico gravado: a janela vale
 * pela data de publicação que cada fonte informa. Vaga sem data não entra em
 * janela nenhuma e é contada à parte (`undated`), para o número não mentir.
 */

export const DASHBOARD_WINDOWS = ['24h', '7d', '30d'] as const;

export const dashboardWindowSchema = z.enum(DASHBOARD_WINDOWS);

export type DashboardWindow = z.infer<typeof dashboardWindowSchema>;

export const jobsDashboardQuerySchema = z.strictObject({
  profileId: z.string().min(1),
  window: dashboardWindowSchema.default('7d'),
});

export type JobsDashboardQuery = z.infer<typeof jobsDashboardQuerySchema>;

const countSchema = z.number().int().min(0);

export const jobsDashboardSchema = z.object({
  window: dashboardWindowSchema,
  generatedAt: z.iso.datetime(),
  /** Vagas publicadas na janela. Uma vaga anunciada em três sites conta uma. */
  total: countSchema,
  /** As da janela anterior, do mesmo tamanho: para dizer se subiu ou caiu. */
  previousTotal: countSchema,
  remote: countSchema,
  companies: countSchema,
  /** Passam nos filtros mas a fonte não diz quando foram publicadas. */
  undated: countSchema,
  bySource: z.array(z.object({ source: z.string(), count: countSchema })),
  byCompany: z.array(z.object({ company: z.string(), count: countSchema })),
  byWorkModel: z.array(
    z.object({ workModel: workModelSchema.nullable(), count: countSchema }),
  ),
  byStack: z.array(z.object({ stack: z.string(), count: countSchema })),
  /** Por hora na janela de 24h; por dia nas outras. Horário de Brasília. */
  timeline: z.array(
    z.object({
      /** "2026-10-15" ou "2026-10-15T14". */
      key: z.string(),
      total: countSchema,
      bySource: z.record(z.string(), countSchema),
    }),
  ),
  failedSources: z.array(z.string()),
});

export type JobsDashboard = z.infer<typeof jobsDashboardSchema>;
