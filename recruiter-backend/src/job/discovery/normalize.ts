import type { ContractType, Seniority, WorkModel } from '@recruit/shared';

/**
 * Transforma o que cada portal diz no vocabulário do projeto.
 *
 * Regra que atravessa tudo: **campo que não dá para classificar vira `null`**,
 * nunca um palpite. Um `workModel` chutado é pior que ausente — some do filtro
 * de quem procura remoto, ou entope o de quem não procura.
 */

/** Acentos fora, minúsculas, espaços colapsados. Base de toda comparação. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Modalidade a partir de texto livre.
 *
 * O Greenhouse não tem campo de modalidade — a única pista é a localização,
 * que é texto escrito por quem publicou: "Remote", "Hybrid - London",
 * "San Francisco, CA". Sem pista, `null`.
 */
export function workModelFromText(text: string | null): WorkModel | null {
  if (!text) {
    return null;
  }

  const value = fold(text);

  if (/\bhybrid\b|\bhibrido\b/.test(value)) {
    return 'hibrido';
  }

  if (/\bremote\b|\bremoto\b|\banywhere\b|\bwork from home\b/.test(value)) {
    return 'remoto';
  }

  if (/\bon-?site\b|\bpresencial\b|\bin office\b/.test(value)) {
    return 'presencial';
  }

  return null;
}

/**
 * País a partir de localização em texto livre.
 *
 * Não tenta ser um geocodificador: reconhece o que aparece nas fontes e
 * devolve `null` no resto. `null` é informação — o filtro de escopo trata
 * "não sei onde é" diferente de "sei que é fora".
 */
const COUNTRY_HINTS: { pattern: RegExp; country: string }[] = [
  { pattern: /\bbra[sz]il\b|\bbrasil\b/, country: 'Brasil' },
  /**
   * Cidade brasileira ANTES de Portugal, e isto não é preferência: o padrão
   * português casa `\bporto\b`, então "Porto Alegre, RS" era classificado como
   * Portugal — e com `scope: 'brasil'` a vaga sumia.
   */
  {
    pattern:
      /\bsao paulo\b|\brio de janeiro\b|\bbelo horizonte\b|\bporto alegre\b|\bsalvador\b|\bbrasilia\b|\bcuritiba\b|\brecife\b|\bfortaleza\b|\bcampinas\b|\bflorianopolis\b|\bgoiania\b|\bmanaus\b|\bbelem\b|\bjoao pessoa\b|\bnatal\b|\bmaceio\b|\baracaju\b|\bcuiaba\b|\bcampo grande\b|\bvitoria\b|\bsorocaba\b|\bribeirao preto\b|\bsao jose dos campos\b|\bosasco\b|\bguarulhos\b|\bniteroi\b|\blondrina\b|\bjoinville\b|\bblumenau\b|\buberlandia\b/,
    country: 'Brasil',
  },
  {
    pattern: /\bportugal\b|\blisboa\b|\blisbon\b|\bporto\b/,
    country: 'Portugal',
  },
  {
    pattern:
      /\bunited states\b|\busa\b|\bu\.s\.\b|\bnew york\b|\bsan francisco\b|\bseattle\b|\baustin\b|\bboston\b|\bchicago\b|\bnyc\b|\bcalifornia\b|\btexas\b/,
    country: 'Estados Unidos',
  },
  {
    pattern: /\bcanada\b|\btoronto\b|\bvancouver\b|\bmontreal\b/,
    country: 'Canadá',
  },
  { pattern: /\bmexico\b|\bciudad de mexico\b/, country: 'México' },
  { pattern: /\bargentina\b|\bbuenos aires\b/, country: 'Argentina' },
  { pattern: /\bcolombia\b|\bbogota\b/, country: 'Colômbia' },
  { pattern: /\bchile\b|\bsantiago\b/, country: 'Chile' },
  {
    pattern:
      /\bunited kingdom\b|\bengland\b|\blondon\b|\buk\b|\bireland\b|\bdublin\b/,
    country: 'Reino Unido',
  },
  {
    pattern:
      /\bgermany\b|\bberlin\b|\bmunich\b|\bdeutschland\b|\bnetherlands\b|\bamsterdam\b|\bfrance\b|\bparis\b|\bspain\b|\bmadrid\b|\bbarcelona\b|\bpoland\b|\bwarsaw\b/,
    country: 'Europa',
  },
  {
    pattern: /\bindia\b|\bbangalore\b|\bbengaluru\b|\bhyderabad\b/,
    country: 'Índia',
  },
  { pattern: /\bisrael\b|\btel aviv\b|\bjerusalem\b/, country: 'Israel' },
  /**
   * Sigla de UF no fim — "Sorocaba, SP", "Blumenau, SC".
   *
   * POR ÚLTIMO de propósito. Várias siglas colidem com estados americanos
   * (MA, PA, SC, AL, MT, MS), então as cidades estrangeiras precisam casar
   * antes: "Boston, MA" já saiu como Estados Unidos quando chega aqui.
   */
  {
    pattern:
      /,\s*(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\b/,
    country: 'Brasil',
  },
];

export function countryFromText(text: string | null): string | null {
  if (!text) {
    return null;
  }

  const value = fold(text);

  for (const { pattern, country } of COUNTRY_HINTS) {
    if (pattern.test(value)) {
      return country;
    }
  }

  return null;
}

/**
 * Modalidade escrita no título, para a fonte que não a declara em campo
 * próprio: "Desenvolvedor .NET - Presencial", "Front-end (Remoto)".
 *
 * Diferente de `workModelFromText`, que lê a LOCALIZAÇÃO e deixa a primeira
 * pista vencer: no título, só quando ele aponta UMA modalidade. "Presencial ou Híbrido" e
 * parecidos ficam `null`: chutar uma delas faria a vaga entrar ou sumir do
 * filtro errado. E nunca sobrescreve o que a fonte declarou.
 */
const WORK_MODEL_HINTS: { pattern: RegExp; model: WorkModel }[] = [
  {
    pattern: /\bremot[oa]\b|\bremote\b|home[ -]?office|100% remoto/,
    model: 'remoto',
  },
  { pattern: /\bh[i]brid[oa]\b|\bhybrid\b/, model: 'hibrido' },
  { pattern: /\bpresencial\b|\bon-?site\b/, model: 'presencial' },
];

export function workModelFromTitle(title: string): WorkModel | null {
  const value = fold(title);
  const found = WORK_MODEL_HINTS.filter(({ pattern }) => pattern.test(value));

  return found.length === 1 ? found[0].model : null;
}

/**
 * Senioridade a partir do título — nenhuma fonte declara este campo.
 *
 * A ordem importa: "Senior Staff Engineer" é staff, e testar `senior` antes
 * classificaria errado.
 */
const SENIORITY_HINTS: { pattern: RegExp; level: Seniority }[] = [
  { pattern: /\bprincipal\b|\bstaff\b|\bdistinguished\b/, level: 'staff' },
  {
    pattern: /\btech lead\b|\bteam lead\b|\blead\b|\blider\b|\bcoordenador\b/,
    level: 'lead',
  },
  {
    pattern: /\bsenior\b|\bsr\.?\b|\bespecialista\b|\bexpert\b/,
    level: 'senior',
  },
  { pattern: /\bpleno\b|\bmid-?level\b/, level: 'pleno' },
  {
    pattern: /\bjunior\b|\bjr\.?\b|\btrainee\b|\bentry\b|\bestagi/,
    level: 'junior',
  },
];

export function seniorityFromTitle(title: string): Seniority | null {
  const value = fold(title);

  for (const { pattern, level } of SENIORITY_HINTS) {
    if (pattern.test(value)) {
      return level;
    }
  }

  return null;
}

/**
 * Vocabulário FECHADO de tecnologias.
 *
 * Fechado de propósito, e isto é a regra do §5 aplicada: a stack é derivada de
 * descrição escrita por terceiro, e vai parar na tela em `StackTags`. Extração
 * livre de palavras deixaria a lista ser escolhida por quem publicou a vaga.
 * Aqui a saída só pode ser um destes rótulos.
 *
 * A chave é o que se procura; o valor é como se escreve na tela.
 */
export const STACK_VOCABULARY: [RegExp, string][] = [
  [/\btypescript\b/, 'TypeScript'],
  [/\bjavascript\b|\bjs\b/, 'JavaScript'],
  [/\bnode\.?js\b|\bnode\b/, 'Node.js'],
  [/\breact\.?js\b|\breact\b/, 'React'],
  [/\bnext\.?js\b/, 'Next.js'],
  [/\bgatsby(?:\.?js)?\b/, 'Gatsby'],
  [/\bvue\.?js\b|\bvue\b/, 'Vue'],
  // Sem \b no fim: "nuxt3" e "nuxtjs" são como a vaga costuma escrever.
  [/\bnuxt/, 'Nuxt'],
  [/\bangular\b/, 'Angular'],
  [/\btailwind/, 'Tailwind'],
  [/\bsass\b|\bscss\b/, 'Sass'],
  [/\bdesign systems?\b|\bstorybook\b/, 'Design System'],
  // Sem "accessibility" solto: as vagas dos EUA trazem um parágrafo padrão
  // sobre "accessibility accommodations" no processo seletivo, e as da Gupy
  // falam de acessibilidade em vaga afirmativa PcD. Nenhum dos dois é a
  // competência técnica, então só entra a forma que a vaga usa para pedi-la.
  [
    /\bwcag\b|\ba11y\b|\b(?:web|digital) accessibility\b|\baccessibility (?:standards|best practices|guidelines)\b|\bacessibilidade (?:web|digital)\b/,
    'Acessibilidade',
  ],
  [
    /\bhighcharts\b|\bd3\.?js\b|\bchart\.?js\b|\becharts\b|\brecharts\b/,
    'Visualização de dados',
  ],
  [/\bpython\b/, 'Python'],
  [/\bdjango\b/, 'Django'],
  [/\bfastapi\b/, 'FastAPI'],
  [/\bjava\b(?!script)/, 'Java'],
  [/\bspring\b/, 'Spring'],
  [/\bkotlin\b/, 'Kotlin'],
  // Sem '\bgo\b' solto: casava com "go-to-market", "we go", "go live". Vale
  // perder uma vaga de Go a marcar dezenas que não são.
  [/\bgolang\b|\bgo\s+(?:developer|engineer|programmer|dev)\b|\(go[,)]/, 'Go'],
  [/\brust\b/, 'Rust'],
  [/\bruby\b/, 'Ruby'],
  [/\brails\b/, 'Rails'],
  [/\bphp\b/, 'PHP'],
  [/\blaravel\b/, 'Laravel'],
  [/\bdrupal\b/, 'Drupal'],
  [/\bwordpress\b|\bwoocommerce\b/, 'WordPress'],
  // \b não serve para símbolo: entre um espaço e um "." não há fronteira de
  // palavra, então /\b\.net\b/ e /\bc#\b/ nunca casavam. Verificado.
  [
    /\bdotnet\b|\bc-sharp\b|\basp\.net\b|(?:^|[^a-z0-9])\.net(?![a-z])|(?:^|[^a-z0-9])c#/,
    '.NET',
  ],
  [/(?:^|[^a-z0-9])c\+\+/, 'C++'],
  [/\bscala\b/, 'Scala'],
  [/\belixir\b/, 'Elixir'],
  [/\bclojure\b/, 'Clojure'],
  [/\bswift\b/, 'Swift'],
  [/\bflutter\b/, 'Flutter'],
  [/\breact native\b/, 'React Native'],
  [/\bpostgres(ql)?\b/, 'PostgreSQL'],
  [/\bmysql\b/, 'MySQL'],
  [/\bmongo(db)?\b/, 'MongoDB'],
  [/\bredis\b/, 'Redis'],
  [/\belasticsearch\b|\bopensearch\b/, 'Elasticsearch'],
  [/\bdynamodb\b/, 'DynamoDB'],
  [/\bcassandra\b/, 'Cassandra'],
  [/\bkafka\b/, 'Kafka'],
  [/\brabbitmq\b/, 'RabbitMQ'],
  [/\bgraphql\b/, 'GraphQL'],
  [/\bgrpc\b/, 'gRPC'],
  [/\brest api\b|\brestful\b/, 'REST'],
  [/\bdocker\b/, 'Docker'],
  [/\bkubernetes\b|\bk8s\b/, 'Kubernetes'],
  [/\bterraform\b/, 'Terraform'],
  [/\baws\b|\bamazon web services\b/, 'AWS'],
  [/\bgcp\b|\bgoogle cloud\b/, 'GCP'],
  [/\bazure\b/, 'Azure'],
  [/\bserverless\b|\blambda\b/, 'Serverless'],
  [/\bci\/cd\b|\bjenkins\b|\bgithub actions\b/, 'CI/CD'],
  [/\bmicroservi[cç]/, 'Microserviços'],
  [
    /\bgraphite\b|\bprometheus\b|\bgrafana\b|\bobservabilidade\b|\bobservability\b/,
    'Observabilidade',
  ],
  [/\bspark\b/, 'Spark'],
  [/\bairflow\b/, 'Airflow'],
  [/\bdbt\b|\bsnowflake\b|\bbigquery\b|\bredshift\b/, 'Data Warehouse'],
  [/\bmachine learning\b|\bpytorch\b|\btensorflow\b/, 'Machine Learning'],
  [/\bllm\b|\bgenai\b|\bgenerative ai\b/, 'IA generativa'],
];

/** Teto de itens: a lista vai para a tela, e vinte chips não informam nada. */
const MAX_STACK = 10;

export function stackFromText(...parts: (string | null)[]): string[] {
  const haystack = fold(parts.filter(Boolean).join(' '));
  const found: string[] = [];

  for (const [pattern, label] of STACK_VOCABULARY) {
    if (found.length >= MAX_STACK) {
      break;
    }

    if (pattern.test(haystack) && !found.includes(label)) {
      found.push(label);
    }
  }

  return found;
}

/**
 * Tipo de contrato.
 *
 * Só mapeia o que é inequívoco. `FullTime` NÃO vira `clt`: CLT é forma
 * jurídica brasileira, e uma vaga em tempo integral em Amsterdã não é CLT.
 * Afirmar isso seria inventar dado que o portal não deu.
 */
export function contractTypeFromLabel(
  label: string | null,
): ContractType | null {
  if (!label) {
    return null;
  }

  const value = fold(label);

  if (/intern|estagi|apprentice|aprendiz/.test(value)) {
    return 'estagio';
  }

  // A Gupy escreve o tipo como identificador ("vacancy_legal_entity"), não
  // como frase: sem o sublinhado, nenhuma vaga PJ dela era reconhecida.
  if (
    /temporar|contract|freelanc|autonom|legal[ _]entity|pessoa juridica|\bpj\b/.test(
      value,
    )
  ) {
    return value.includes('temporar') ? 'temporario' : 'pj';
  }

  if (/\bclt\b|effective|efetivo/.test(value)) {
    return 'clt';
  }

  return null;
}

/** Data em ISO, aceitando epoch em ms ou s e string. `null` quando não dá. */
export function toIsoDate(value: unknown): string | null {
  if (typeof value === 'number') {
    // Epoch em segundos vs milissegundos: 10^12 fica em 2001 se lido como ms.
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}
