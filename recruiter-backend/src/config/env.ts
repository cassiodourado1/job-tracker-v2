import { z } from 'zod';

/**
 * Trata variável presente porém vazia (`FOO=` no .env) como ausente.
 * Sem isso, `ANTHROPIC_API_KEY=` passaria pela validação como string vazia.
 */
const optionalString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().min(1).optional(),
);

/**
 * Lista de slugs de board, separados por vírgula.
 *
 * O slug entra no caminho da URL da API de cada plataforma, então só passa
 * o formato que um slug de verdade tem: letras, números e hífen. Uma barra ou
 * um `?` mudaria o caminho ou a consulta da requisição.
 */
const boardList = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((slug) => slug.trim().toLowerCase())
          .filter(Boolean)
      : value,
  z
    .array(
      z
        .string()
        .regex(
          /^[a-z0-9][a-z0-9-]{0,62}$/,
          'Slug de board inválido: use só letras, números e hífen.',
        ),
    )
    .max(50)
    .default([]),
);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  /**
   * Interface em que a API escuta. Padrão: SÓ a máquina local.
   *
   * A API não tem autenticação, e isso é decisão do §1 — um usuário, uma
   * máquina. O que torna essa decisão segura é ninguém mais alcançá-la. Sem
   * host, o Nest escuta em 0.0.0.0, e qualquer um na mesma rede Wi-Fi lia seu
   * perfil, alterava seus dados e fazia seu navegador logado abrir a URL que
   * quisesse. Mude só se souber por quê.
   *
   * `API_HOST` e não `HOST`: alguns shells — o zsh, por exemplo — definem
   * `HOST` sozinhos com o nome da máquina. Se vazasse para o processo, a API
   * escutaria no nome da máquina, que resolve para o IP da rede, e o buraco
   * reabriria em silêncio.
   */
  API_HOST: z.string().min(1).default('127.0.0.1'),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),

  // Infraestrutura: obrigatória, o backend não funciona sem ela.
  //
  // Sem `REDIS_URL`: ela era obrigatória no boot e nenhum código a lia. O
  // Redis estava previsto para filas BullMQ que nunca foram necessárias.
  DATABASE_URL: z.url(),

  // Opcionais: sem elas, a feature correspondente fica desligada.
  ANTHROPIC_API_KEY: optionalString,
  IMAP_HOST: optionalString,
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  IMAP_USER: optionalString,
  IMAP_PASSWORD: optionalString,
  /**
   * Navegador do preenchimento de formulário, quando não está no lugar
   * padrão. Sem isto, o app procura Chrome, Brave, Edge, Chromium e Vivaldi
   * nos caminhos de instalação comuns — ver `form-fill/browser.ts`.
   */
  FORM_FILL_BROWSER_PATH: optionalString,
  /**
   * O rótulo do Gmail que o app lê. Rótulo é pasta no IMAP.
   *
   * Ler um rótulo dedicado em vez da INBOX faz o "nunca mandar a caixa inteira
   * para fora" da seção 4 ser garantido pelo Gmail, antes de o código ver
   * qualquer coisa — e muda pelo filtro do Gmail, sem tocar em código.
   */
  IMAP_MAILBOX: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().min(1).default('job-tracker'),
  ),
  /**
   * Sincronizar ao subir o processo — a única sincronização que acontece sem
   * clique. Ligada por padrão; desligue com `false` se usar
   * `nest start --watch`, que reinicia a cada arquivo salvo e abriria uma
   * conexão IMAP por gravação.
   *
   * NÃO usar `z.coerce.boolean()`: ele converte a string "false" em `true`.
   */
  /**
   * Boards de empresas que a descoberta lê, separados por vírgula. Ver
   * `job/discovery/watchlist.ts`.
   */
  DISCOVERY_GREENHOUSE_BOARDS: boardList,
  DISCOVERY_ASHBY_BOARDS: boardList,
  DISCOVERY_LEVER_BOARDS: boardList,
  IMAP_SYNC_ON_BOOT: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() === 'true' : value),
    z.boolean().default(true),
  ),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Passada para `ConfigModule.forRoot({ validate })`. Lança no boot para que uma
 * variável faltando vire erro imediato, e não uma connection string com
 * "undefined" no meio.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }

  return parsed.data;
}
