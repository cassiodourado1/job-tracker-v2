/**
 * Opções do agente diário. A regra que importa: sem `--com-ia`, nada pago
 * roda. A IA é opt-in, por flag escrita na linha de comando, porque um
 * padrão pago já zerou o crédito num dia (19/11) sem achar uma vaga boa.
 */

/** Opções que levam valor logo depois (`--top 10`). */
const WITH_VALUE = new Set(['--top', '--teto', '--max-curriculos']);
const FLAGS = new Set([
  '--com-ia',
  '--com-curriculo',
  '--sem-aviso',
  // Antigas, de quando a IA era o padrão. Hoje já são o comportamento
  // normal: aceitas para não quebrar um agendamento instalado antes.
  '--sem-analise',
  '--sem-curriculo',
]);

function integer(name, raw, min, max) {
  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} precisa ser um inteiro entre ${min} e ${max}.`);
  }

  return value;
}

export function parseOptions(argv) {
  const values = {};
  const flags = new Set();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (WITH_VALUE.has(arg)) {
      values[arg] = argv[i + 1];
      i += 1;
    } else if (FLAGS.has(arg)) {
      flags.add(arg);
    } else {
      // Erro, e não silêncio: "--com-IA" digitado errado precisa avisar, e
      // não rodar de um jeito que a pessoa não pediu.
      throw new Error(`Opção desconhecida: ${arg}`);
    }
  }

  const ai = flags.has('--com-ia');
  const tailor = flags.has('--com-curriculo');

  // Separada da análise: passar num filtro nunca basta para gastar com
  // currículo; quem quer currículo automático pede as duas coisas.
  if (tailor && !ai) {
    throw new Error(
      '--com-curriculo só vale junto com --com-ia: o currículo adaptado depende da análise.',
    );
  }

  // Sem IA, --teto e --max-curriculos não têm o que limitar. Ignorar (e
  // dizer) em vez de falhar mantém funcionando o agendamento antigo, que
  // passava --teto.
  const ignored = [];
  if (!ai && values['--teto'] !== undefined) ignored.push('--teto');
  if (!tailor && values['--max-curriculos'] !== undefined) ignored.push('--max-curriculos');

  return {
    ai,
    tailor,
    // Sem IA: quantas vagas novas pôr na Seleção. Com IA: a meta de vagas
    // forte ou boa a encontrar.
    top: integer('--top', values['--top'] ?? (ai ? 5 : 10), 0, 50),
    // Quantidade de análises, não dinheiro: o custo de cada uma varia.
    maxAnalyses: ai ? integer('--teto', values['--teto'] ?? 60, 1, 500) : 0,
    maxTailored: tailor
      ? integer('--max-curriculos', values['--max-curriculos'] ?? 10, 0, 100)
      : 0,
    notify: !flags.has('--sem-aviso'),
    ignored,
  };
}
