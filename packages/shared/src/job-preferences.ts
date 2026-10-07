import { z } from 'zod';
import {
  contractTypeSchema,
  externalUrlSchema,
  jobSearchResultSchema,
  workModelSchema,
} from './job';

/**
 * Preferências de vaga — o filtro que o currículo NÃO tem como adivinhar.
 *
 * A divisão importa, e ela decide o comportamento de cada campo:
 *
 *   CORTAM     escopo, modalidade, contrato e senioridade. São critérios de
 *              aceitação: se você não aceita presencial, vaga presencial é
 *              ruído, não opção.
 *   PRIORIZA   stack. Marcar Go empurra vaga de Go para o topo sem esconder a
 *              de Kotlin. Cortar por stack seria pior do que parece — metade
 *              das fontes não traz descrição, a stack detectada vem vazia, e a
 *              vaga sumiria por falta de texto, não por não combinar.
 *
 * Array vazio (ou `scope` nulo) significa "tanto faz", nunca "nenhum". É a
 * diferença entre um filtro recém-criado e um filtro que zera a lista sem
 * explicar por quê.
 */

/**
 * Onde a vaga pode estar.
 *
 * Duas opções e mais nada, por decisão de produto: marcar uma desmarca a
 * outra, e nenhuma marcada é tanto faz. Por isso é anulável em vez de ter um
 * terceiro valor "ambos" — o estado neutro é a ausência de escolha.
 */
export const locationScopeSchema = z.enum(['brasil', 'internacional']);
export type LocationScope = z.infer<typeof locationScopeSchema>;
export const LOCATION_SCOPES = locationScopeSchema.options;

/**
 * Senioridade canônica, derivada do título — nenhuma fonte declara este campo.
 * Separada do `contractType` de propósito: estágio é forma de contrato,
 * júnior é nível.
 */
export const senioritySchema = z.enum([
  'junior',
  'pleno',
  'senior',
  'staff',
  'lead',
]);
export type Seniority = z.infer<typeof senioritySchema>;
export const SENIORITIES = senioritySchema.options;

/**
 * As tecnologias que o detector sabe reconhecer.
 *
 * Vive aqui, e não no backend, porque o modal de filtros precisa oferecer
 * exatamente estas: uma caixa de "Svelte" que o detector não sabe achar seria
 * um controle que não faz nada. As expressões que detectam cada uma ficam no
 * backend — só os rótulos cruzam a fronteira.
 */
export const STACK_LABELS = [
  'TypeScript',
  'JavaScript',
  'Node.js',
  'React',
  'Next.js',
  'Gatsby',
  'Vue',
  'Nuxt',
  'Angular',
  'Tailwind',
  'Sass',
  'Design System',
  'Acessibilidade',
  'Visualização de dados',
  'Python',
  'Django',
  'FastAPI',
  'Java',
  'Spring',
  'Kotlin',
  'Go',
  'Rust',
  'Ruby',
  'Rails',
  'PHP',
  'Laravel',
  'Drupal',
  'WordPress',
  '.NET',
  'C++',
  'Scala',
  'Elixir',
  'Clojure',
  'Swift',
  'Flutter',
  'React Native',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'Elasticsearch',
  'DynamoDB',
  'Cassandra',
  'Kafka',
  'RabbitMQ',
  'GraphQL',
  'gRPC',
  'REST',
  'Docker',
  'Kubernetes',
  'Terraform',
  'AWS',
  'GCP',
  'Azure',
  'Serverless',
  'CI/CD',
  'Microserviços',
  'Observabilidade',
  'Spark',
  'Airflow',
  'Data Warehouse',
  'Machine Learning',
  'IA generativa',
] as const;

export type StackLabel = (typeof STACK_LABELS)[number];
export const stackLabelSchema = z.enum(STACK_LABELS);

const keyword = z.string().trim().min(1).max(40);

/**
 * Até quantos dias uma vaga de alerta do LinkedIn ainda aparece.
 *
 * O alerta traz título, empresa e link, mas não diz se a vaga ainda aceita
 * candidatura — e abrir a página para conferir é acesso automatizado ao
 * LinkedIn, que o contrato proíbe e que arrisca a conta (§5). A idade é o
 * sinal que sobra: vaga de alerta antigo é a que mais costuma estar fechada.
 *
 * O teto é a janela que a fonte lê da caixa; acima disso não há o que mostrar.
 */
export const LINKEDIN_MAX_AGE_LIMIT = 45;
export const DEFAULT_LINKEDIN_MAX_AGE_DAYS = 14;
export const LINKEDIN_AGE_OPTIONS = [7, 14, 21, 30, 45] as const;

/**
 * O que as fontes POR BUSCA (Gupy e portais brasileiros) recebem como termo
 * quando a caixa de texto está vazia.
 *
 * Diferente do `titleIncludes`, que corta o que já chegou: o termo decide o que
 * CHEGA. A Gupy só devolve o que casa com a busca, então sem "front-end" aqui
 * uma vaga de "Especialista Frontend" nunca entra na rodada, por mais aberto
 * que esteja o filtro de título.
 *
 * Teto de seis porque cada termo custa páginas no portal (§5, ritmo humano), e
 * a rodada precisa caber no prazo da fonte.
 */
export const MAX_SEARCH_TERMS = 6;
export const DEFAULT_SEARCH_TERMS = [
  'desenvolvedor',
  'engenheiro de software',
  'backend',
];

export const jobPreferencesSchema = z.object({
  /** `null` = tanto faz. */
  scope: locationScopeSchema.nullable(),
  workModels: z.array(workModelSchema).max(3),
  contractTypes: z.array(contractTypeSchema).max(4),
  seniorities: z.array(senioritySchema).max(5),
  /** Prioriza na ordenação; não elimina. */
  stacks: z.array(stackLabelSchema).max(STACK_LABELS.length),
  /** Título precisa conter uma destas. Vazio = qualquer título. */
  titleIncludes: z.array(keyword).max(30),
  /** Título com qualquer uma destas é descartado. Vence o `titleIncludes`. */
  titleExcludes: z.array(keyword).max(30),
  /**
   * Corta só as vagas de alerta do LinkedIn; as outras fontes trazem vaga
   * aberta por construção. Com padrão, para as preferências gravadas antes
   * deste campo continuarem válidas.
   */
  linkedinMaxAgeDays: z
    .number()
    .int()
    .min(1)
    .max(LINKEDIN_MAX_AGE_LIMIT)
    .default(DEFAULT_LINKEDIN_MAX_AGE_DAYS),
  /**
   * Termos de busca das fontes por busca. Com padrão, como o campo acima,
   * para as preferências gravadas antes dele continuarem válidas.
   */
  searchTerms: z
    .array(keyword)
    .min(1)
    .max(MAX_SEARCH_TERMS)
    .default(DEFAULT_SEARCH_TERMS),
});

export type JobPreferences = z.infer<typeof jobPreferencesSchema>;

/**
 * Não existe filtro de salário mínimo, e é deliberado: medindo as fontes, 4 de
 * 100 vagas do RemoteOK declaram faixa, o `compensation` do Ashby vem vazio, e
 * Greenhouse, Lever e Gupy não têm o campo. Um filtro de salário ou zera a
 * lista ou não faz nada — as duas formas de mentir para quem o configurou.
 * Volta quando a extração por URL preencher o salário das vagas abertas.
 */

/**
 * O padrão já vem útil: os boards são majoritariamente de vagas não técnicas
 * (medido: 449 técnicas em 1.334), e um filtro vazio faria a primeira tela ser
 * uma lista de vagas de vendas.
 */
export const defaultJobPreferences: JobPreferences = {
  scope: null,
  workModels: [],
  contractTypes: [],
  seniorities: [],
  stacks: [],
  titleIncludes: [
    'engineer',
    'engenhei',
    'developer',
    'desenvolved',
    'backend',
    'back-end',
    // Front-end nas três grafias que os portais usam. Sem elas, "Especialista
    // Frontend (React)" e "DEV FRONT END VUE.JS" eram descartadas: medido, 9
    // de 53 vagas de front-end da Gupy caíam só pelo título.
    'frontend',
    'front-end',
    'front end',
    'desarroll',
    'líder técnico',
    'drupal',
    'wordpress',
    'fullstack',
    'full-stack',
    'software',
    'sre',
    'platform',
    'infra',
    'devops',
    'tech lead',
    'arquitet',
    'programad',
  ],
  titleExcludes: [
    'sales',
    'recruiter',
    'account executive',
    'vendas',
    'estágio',
    'estagio',
  ],
  linkedinMaxAgeDays: DEFAULT_LINKEDIN_MAX_AGE_DAYS,
  searchTerms: DEFAULT_SEARCH_TERMS,
};

/**
 * Query da descoberta.
 *
 * `cursor` é opaco e ordenável, no formato `pontuação:url`, não um deslocamento
 * numérico. Deslocamento seria errado aqui: o usuário descarta vagas enquanto
 * navega, o conjunto encolhe entre uma requisição e a seguinte, e o item que
 * estava na posição 20 passa para a 12 — as vagas 20 a 27 nunca apareceriam.
 * Chave ordenável não desloca quando se remove do meio.
 */
/**
 * Ordem da lista da descoberta.
 *
 * O padrão é a mais recente primeiro: vaga nova é a que ainda tem pouca gente
 * concorrendo, e é a que você ainda não viu. Vaga sem data (o card da fonte
 * não informa) vai para o fim, em vez de fingir que é de hoje.
 */
export const jobSortSchema = z.enum([
  'recentes',
  'relevancia',
  'empresa',
  'cargo',
]);
export type JobSort = z.infer<typeof jobSortSchema>;
export const JOB_SORTS = jobSortSchema.options;
export const DEFAULT_JOB_SORT: JobSort = 'recentes';

export const discoverJobsSchema = z.strictObject({
  profileId: z.string().min(1),
  sort: jobSortSchema.optional(),
  cursor: z.string().trim().max(2100).optional(),
  q: z.string().trim().max(120).optional(),
  /**
   * Liga as fontes lentas, que leem portal página a página em vez de receber o
   * acervo numa resposta. Opt-in porque custa segundos.
   */
  expanded: z.coerce.boolean().optional(),
});

export type DiscoverJobsQuery = z.infer<typeof discoverJobsSchema>;

/**
 * Por que a busca parou.
 *
 * `fim` — acabaram as vagas que passam nas preferências.
 * `nada-novo` — ainda existem vagas, mas você já salvou, aplicou ou descartou
 * todas elas.
 *
 * Confundir as duas quebra a confiança na ferramenta: uma pede para afrouxar o
 * filtro, a outra diz que você está em dia.
 */
export const exhaustionSchema = z.enum(['fim', 'nada-novo']);
export type Exhaustion = z.infer<typeof exhaustionSchema>;

/**
 * Outro anúncio da MESMA vaga: mesma empresa, mesmo título, URL diferente.
 *
 * Empresa grande publica a mesma posição várias vezes — medido, o PagBank
 * tinha 9 anúncios de "Engenheiro de Software Sr. (Java)" na Gupy. São
 * candidaturas distintas, e se candidatar a várias aumenta a chance; mas
 * nove cards idênticos enterram o resto da lista. Então viram um card, com os
 * anúncios listados nele.
 */
export const jobVariantSchema = z.object({
  url: externalUrlSchema,
  source: z.string(),
  location: z.string().nullable(),
  workModel: workModelSchema.nullable(),
  postedAt: z.iso.datetime().nullable(),
});

export type JobVariant = z.infer<typeof jobVariantSchema>;

/** Uma vaga da descoberta, com os outros anúncios dela. */
export const discoveredJobSchema = jobSearchResultSchema.extend({
  others: z.array(jobVariantSchema),
});

export type DiscoveredJob = z.infer<typeof discoveredJobSchema>;

/**
 * Resposta da descoberta.
 *
 * `total` é quantas vagas passam no filtro, não quantas vieram no lote — é o
 * número que diz "42 vagas em 20 empresas" e evita a tela prometer um fluxo
 * infinito que não existe. Anúncios repetidos contam uma vez: é o número de
 * cards, não de URLs.
 */
export const discoverResultSchema = z.object({
  items: z.array(discoveredJobSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
  exhausted: exhaustionSchema.nullable(),
  /** Fontes que falharam nesta rodada, para a tela não fingir cobertura total. */
  failedSources: z.array(z.string()),
  /** Tempo real de rede desta rodada. 0 quando veio do cache. */
  fetchMs: z.number().int(),
});

export type DiscoverResult = z.infer<typeof discoverResultSchema>;

/**
 * Descartar uma vaga da descoberta.
 *
 * Leva empresa, cargo e origem junto porque a vaga descartada não existe em
 * lugar nenhum do banco — só a URL não daria para desfazer depois de recarregar
 * a página nem para listar o que foi recusado.
 */
export const dismissJobSchema = z.strictObject({
  profileId: z.string().min(1),
  url: externalUrlSchema,
  company: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(40),
});

export type DismissJobInput = z.infer<typeof dismissJobSchema>;

export const undismissJobSchema = z.strictObject({
  profileId: z.string().min(1),
  url: externalUrlSchema,
});

export type UndismissJobInput = z.infer<typeof undismissJobSchema>;
