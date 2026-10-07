import { Logger } from '@nestjs/common';
import type { JobSearchResult, Seniority } from '@recruit/shared';
import { htmlToText } from '../../html-to-text';
import { fetchPublicPage } from '../../safe-fetch';
import { canonicalJobUrl } from '../canonical-url';
import { fold, seniorityFromTitle, stackFromText } from '../normalize';
import type { DiscoverySource } from '../provider';

/**
 * Programathor — portal brasileiro de vagas de programação.
 *
 * Sem API e sem busca: `?search=` é ignorado. O que existe é a listagem
 * geral, 15 por página, da mais recente para a mais antiga, e é ela que se lê.
 * O termo do perfil não chega aqui; quem filtra é o título, depois.
 *
 * É pequena, e vale saber antes de esperar volume: medido em outubro de 2026,
 * ~20 vagas abertas no total, de todas as áreas. A listagem mistura vaga
 * VENCIDA com aberta, e a partir da segunda ou terceira página quase tudo é
 * vencido. Entra porque é a única fonte brasileira que mostra faixa salarial
 * ("Até R$18.000").
 *
 * Lê só a listagem, nunca a página de cada vaga: o card já traz empresa,
 * local, salário, senioridade, contrato e tecnologias. Uma requisição por
 * página, em sequência, com pausa — §5. O `robots.txt` só fecha áreas de
 * usuário e de empresa.
 */

const ORIGIN = 'https://programathor.com.br';

/** Depois disto é tudo vencido; e a leitura para antes, na primeira página sem vaga aberta. */
const MAX_PAGES = 4;

const DELAY_MS = 500;

/** Os campos do card são marcados pelo ícone, não pela posição. */
const ICONS = {
  company: 'fa-briefcase',
  location: 'fa-map-marker-alt',
  salary: 'fa-money-bill-alt',
  seniority: 'fa-chart-bar',
  contract: 'fa-file-alt',
} as const;

type Field = keyof typeof ICONS;

export interface ProgramathorCard {
  path: string;
  title: string;
  expired: boolean;
  fields: Partial<Record<Field, string>>;
  tags: string[];
}

export class ProgramathorSource implements DiscoverySource {
  readonly name = 'programathor';

  readonly deadlineMs = 30_000;

  private readonly logger = new Logger(ProgramathorSource.name);

  async fetch(): Promise<JobSearchResult[]> {
    const found: JobSearchResult[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { html } = await fetchPublicPage(
        page === 1 ? `${ORIGIN}/jobs` : `${ORIGIN}/jobs/page/${page}`,
      );
      const cards = readProgramathorCards(html);

      if (cards.length === 0) {
        if (page === 1) {
          // Listagem que responde 200 e não rende card é layout mudado. Sem
          // isto a fonte viraria zero vagas em silêncio.
          throw new Error('listagem sem cards de vaga — o layout mudou');
        }

        break;
      }

      const open = cards.filter((card) => !card.expired);

      found.push(
        ...open
          .map(cardToResult)
          .filter((job): job is JobSearchResult => job !== null),
      );

      // Vencida acumula no fim da lista: página sem nenhuma aberta encerra.
      if (open.length === 0) {
        break;
      }

      await sleep(DELAY_MS);
    }

    this.logger.log(`programathor: ${found.length} vagas abertas`);

    return found;
  }
}

/** Os cards de uma página de listagem. Card sem link ou sem título é pulado. */
export function readProgramathorCards(html: string): ProgramathorCard[] {
  const cards: ProgramathorCard[] = [];

  // A classe exata: `cell-list-content` também começa com "cell-list", e
  // cortar nela partiria cada card em dois — link de um lado, título do outro.
  for (const chunk of html.split(/<div class="cell-list(?=[\s"])/).slice(1)) {
    const path = /<a href="(\/jobs\/\d+[^"]*)"/.exec(chunk)?.[1];
    const heading = /<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(chunk)?.[1];

    if (!path || !heading) {
      continue;
    }

    // Os selos ("Vencida", "PRESENCIAL - SOMENTE…") são <span> dentro do <h3>.
    const badges = [...heading.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)]
      .map((match) => text(match[1]))
      .join(' ');
    const title = text(heading.replace(/<span\b[^>]*>[\s\S]*?<\/span>/g, ''));

    if (!title) {
      continue;
    }

    const fields: Partial<Record<Field, string>> = {};

    for (const match of chunk.matchAll(
      /<span><i class='([^']+)'><\/i>([\s\S]*?)<\/span>/g,
    )) {
      const field = (Object.keys(ICONS) as Field[]).find((key) =>
        match[1].split(' ').includes(ICONS[key]),
      );

      if (field) {
        fields[field] = text(match[2]);
      }
    }

    const tags = [
      ...chunk.matchAll(/<span class='tag-list[^']*'>([\s\S]*?)<\/span>/g),
    ].map((match) => text(match[1]));

    cards.push({
      path,
      title,
      expired: /\bvencida\b/i.test(badges),
      fields,
      tags,
    });
  }

  return cards;
}

export function cardToResult(card: ProgramathorCard): JobSearchResult | null {
  const url = canonicalJobUrl(ORIGIN + card.path);
  const company = card.fields.company;

  if (!url || !company) {
    return null;
  }

  const salary = salaryFromLabel(card.fields.salary ?? null);

  return {
    company,
    title: card.title,
    url,
    source: 'programathor',
    description: null,
    stack: stackFromText(card.title, card.tags.join(', ')),
    requirements: [],
    benefits: [],
    seniority:
      seniorityFromLabel(card.fields.seniority ?? null) ??
      seniorityFromTitle(card.title),
    workModel: workModelFromLocation(card.fields.location ?? null),
    contractType: contractTypeFromLabel(card.fields.contract ?? null),
    location: locationFromLabel(card.fields.location ?? null),
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.min === null && salary.max === null ? null : 'BRL',
    weeklyHours: null,
    // O card não diz quando a vaga foi publicada.
    postedAt: null,
  };
}

/**
 * "Até R$18.000", "A partir de R$8.000", "R$6.000 a R$9.000". Formato que
 * não se reconhece vira nada — faixa chutada é pior que nenhuma.
 */
export function salaryFromLabel(label: string | null): {
  min: number | null;
  max: number | null;
} {
  const none = { min: null, max: null };

  if (!label) {
    return none;
  }

  const values = [...label.matchAll(/R\$\s*([\d.]+)(?:,\d+)?/g)].map((match) =>
    Number(match[1].replace(/\./g, '')),
  );

  if (values.length === 0 || values.some((value) => !(value > 0))) {
    return none;
  }

  const value = fold(label);

  if (values.length === 2) {
    return { min: Math.min(...values), max: Math.max(...values) };
  }

  if (value.startsWith('ate')) {
    return { min: null, max: values[0] };
  }

  if (value.startsWith('a partir') || value.startsWith('de ')) {
    return { min: values[0], max: null };
  }

  return { min: values[0], max: values[0] };
}

function seniorityFromLabel(label: string | null): Seniority | null {
  const value = fold(label ?? '');

  if (value.includes('senior') || value.includes('especialista')) {
    return 'senior';
  }

  if (value.includes('pleno')) return 'pleno';
  if (value.includes('junior')) return 'junior';

  return null;
}

/** "CLT / PJ" aceita os dois: escolher um faria a vaga sumir do outro filtro. */
function contractTypeFromLabel(
  label: string | null,
): JobSearchResult['contractType'] {
  const value = fold(label ?? '');
  const clt = /\bclt\b/.test(value);
  const pj = /\bpj\b/.test(value);

  if (clt === pj) {
    return null;
  }

  return clt ? 'clt' : 'pj';
}

/** "Remoto", "São Paulo/SP (Híbrido)", "GOIÂNIA (Presencial)". */
function workModelFromLocation(
  label: string | null,
): JobSearchResult['workModel'] {
  const value = fold(label ?? '');

  if (value.includes('hibrido')) return 'hibrido';
  if (value.includes('presencial')) return 'presencial';
  if (value.includes('remoto')) return 'remoto';

  return null;
}

/** Portal brasileiro: a cidade vem sem país, e "Remoto" não é lugar. */
function locationFromLabel(label: string | null): string | null {
  const place = (label ?? '')
    .replace(/\((?:remoto|h[ií]brido|presencial)\)/gi, '')
    .trim();

  if (!place || /^remoto$/i.test(place)) {
    return 'Brasil';
  }

  // Às vezes o card já traz o país ("Novo Hamburgo, Rio Grande do Sul, Brasil").
  return /\bbrasil\b/i.test(place) ? place : `${place}, Brasil`;
}

function text(html: string): string {
  return htmlToText(html, 300).replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
