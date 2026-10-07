/**
 * Tira os dados pessoais do texto de um currículo ANTES de ele ir ao modelo.
 *
 * A regra do projeto (§7) é mandar à IA só a parte profissional. O que sai
 * daqui não se perde: email, telefone e links voltam à parte e preenchem o
 * perfil direto, sem passar pela IA. O endereço FICA — a cidade é o que deixa
 * a descoberta achar vaga local, e o modelo a devolve como localização.
 *
 * O nome é o caso difícil: não existe padrão que reconheça "um nome". Usa-se o
 * nome do perfil, que a pessoa já informou: some a sequência completa em
 * qualquer lugar, e some a primeira linha do currículo quando ela é feita das
 * palavras desse nome. Palavras soltas do nome NÃO são apagadas no resto do
 * texto: sobrenome costuma ser também nome de rua, cidade ou empresa
 * ("Dourado" e "João Dourado"), e apagá-lo destruiria o endereço.
 *
 * Tudo por expressão sem aninhamento de quantificador — a entrada vem de
 * arquivo do usuário, e uma expressão catastrófica trava o processo.
 */

export interface RedactedResume {
  text: string;
  email: string | null;
  phone: string | null;
  links: {
    linkedin: string | null;
    github: string | null;
    website: string | null;
  };
  /** O que foi tirado, para a tela dizer o que NÃO foi enviado. */
  removed: string[];
}

const EMAIL =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/**
 * Telefone com DDD: no mínimo dez dígitos, então "2016 2018" e "2019 – 2020"
 * nunca casam. O código do país e os parênteses são opcionais.
 */
const PHONE =
  /(?:\+\s?\d{1,3}[\s.-]?)?\(?\b\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}\b/g;

const LINKEDIN =
  /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9_%-]+\/?/gi;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/gi;
const WEB_URL = /\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/gi;

/** CPF com ou sem pontuação, só quando tem a forma completa. */
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

/**
 * Linhas que só existem para identificar a pessoa, inteiras: o valor depois do
 * rótulo vem em formatos demais para casar sozinho.
 */
const PERSONAL_LINE =
  /^.*\b(?:cpf|rg|cnh|data de nascimento|nascimento|nascid[oa] em|estado civil|filia[cç][aã]o|idade)\b.*$/gim;

export function redactResume(
  raw: string,
  fullName: string | null,
): RedactedResume {
  const removed = new Set<string>();
  let text = raw.replace(/\r\n?/g, '\n');

  const take = (pattern: RegExp, label: string, marker: string) => {
    const found: string[] = [];

    text = text.replace(pattern, (match) => {
      found.push(match.trim());
      removed.add(label);

      return marker;
    });

    return found;
  };

  // Ordem importa: links do LinkedIn e do GitHub antes do genérico, e email
  // antes de URL ("nome@site.com" não pode virar link).
  const emails = take(EMAIL, 'email', '[email removido]');
  const linkedin = take(LINKEDIN, 'LinkedIn', '[link removido]');
  const github = take(GITHUB, 'GitHub', '[link removido]');
  const websites = take(WEB_URL, 'links', '[link removido]');
  take(CPF, 'documentos', '[documento removido]');
  const phones = take(PHONE, 'telefone', '[telefone removido]');

  text = text.replace(PERSONAL_LINE, () => {
    removed.add('dados pessoais');

    return '';
  });

  if (fullName) {
    const before = text;

    text = removeName(text, fullName);

    if (text !== before) {
      removed.add('nome');
    }
  }

  return {
    text: text.replace(/\n{3,}/g, '\n\n').trim(),
    email: emails[0] ?? null,
    phone: phones[0] ?? null,
    links: {
      linkedin: linkedin[0] ? withScheme(linkedin[0]) : null,
      github: github[0] ? withScheme(github[0]) : null,
      website: websites[0] ? withScheme(websites[0]) : null,
    },
    removed: [...removed],
  };
}

function removeName(text: string, fullName: string): string {
  const words = fold(fullName).split(' ').filter(Boolean);

  if (words.length === 0) {
    return text;
  }

  // A sequência completa, em qualquer caixa e com ou sem acento.
  const sequence = new RegExp(
    words.map((word) => accentInsensitive(word)).join('\\s+'),
    'gi',
  );
  let result = text.replace(sequence, '[nome removido]');

  // A primeira linha com texto, quando é feita das palavras do nome: cobre
  // "CASSIO DOURADO" com o perfil "Cassio Figueredo Dourado".
  const lines = result.split('\n');
  const first = lines.findIndex((line) => line.trim() !== '');

  if (first >= 0) {
    const lineWords = fold(lines[first]).split(' ').filter(Boolean);
    const fromName = lineWords.filter((word) => words.includes(word));

    if (
      lineWords.length > 0 &&
      lineWords.length <= 6 &&
      fromName.length >= Math.min(2, words.length) &&
      fromName.length / lineWords.length >= 0.5
    ) {
      lines[first] = '[nome removido]';
      result = lines.join('\n');
    }
  }

  return result;
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "joao" casa "João", "JOÃO" e "joao". */
function accentInsensitive(word: string): string {
  const variants: Record<string, string> = {
    a: '[aáàâãä]',
    e: '[eéèêë]',
    i: '[iíìîï]',
    o: '[oóòôõö]',
    u: '[uúùûü]',
    c: '[cç]',
    n: '[nñ]',
  };

  return [...word]
    .map(
      (char) => variants[char] ?? char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
