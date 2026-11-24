#!/usr/bin/env node
/**
 * Agente diário: lê as vagas que o próprio app já agrupa, filtra e deixa as
 * novas em Minhas vagas, na Seleção do agente, e avisa por notificação do
 * macOS.
 *
 * SEM IA POR PADRÃO. Uma execução normal não chama a Anthropic: lê a busca
 * (que já aplica o filtro do seu perfil), corta pelo título e pela data, e
 * salva as N vagas mais novas marcadas como "encontradas sem IA". Você
 * escolhe no app quais analisar, com o botão da própria vaga.
 *
 * Com `--com-ia`, cada vaga passa pela análise de aderência (paga) até achar
 * a meta de vagas forte ou boa, ou bater o `--teto` de análises. O currículo
 * adaptado automático pede outra opção, `--com-curriculo`. Esse caminho
 * gastou todo o crédito em 19/11 sem achar uma vaga boa: por isso é opt-in.
 *
 * O que ele NUNCA faz: candidatar, enviar formulário, descartar vaga, mudar
 * status de candidatura ou acessar o LinkedIn (§5).
 *
 * Só fala com 127.0.0.1. Se a API estiver parada, sobe uma e a derruba no
 * fim. Sem `--com-ia`, ela sobe SEM a chave da Anthropic: a sincronização de
 * email do boot lê os emails, mas não chama o Claude para classificá-los.
 *
 * Uso: node scripts/agente-diario.mjs [--top 10] [--sem-aviso]
 *      node scripts/agente-diario.mjs --com-ia [--top 5] [--teto 60] [--com-curriculo [--max-curriculos 10]]
 * Variáveis: AGENTE_API (padrão http://127.0.0.1:3333), AGENTE_PERFIL (id do
 * perfil; padrão o perfil marcado como padrão), AGENTE_DIR (padrão
 * ~/agente-vagas).
 */
import { spawn, execFile } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOptions } from './agente/opcoes.mjs';
import { plain, runRound } from './agente/rodada.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.AGENTE_API ?? 'http://127.0.0.1:3333';
const DIR = process.env.AGENTE_DIR ?? join(homedir(), 'agente-vagas');

/** A API escuta só em loopback (§2); qualquer outro endereço é engano. */
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  throw new Error(`AGENTE_API precisa ser local, recebi ${API}`);
}

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
}).format(new Date());

async function log(line) {
  const stamp = new Date().toISOString();
  console.log(line);
  await appendFile(join(DIR, 'agente.log'), `${stamp} ${line}\n`);
}

async function api(path, init = {}, retried = false) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    // A API só aceita escrita em JSON (§2); vai em toda chamada.
    headers: { 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(init.timeoutMs ?? 120_000),
  });
  const body = await response.json().catch(() => null);
  // A análise e a adaptação aceitam 10 chamadas por minuto: espera a janela
  // passar e tenta uma vez mais, em vez de perder a vaga do dia.
  if (response.status === 429 && !retried) {
    await log('Limite de chamadas por minuto: esperando 65 segundos.');
    await new Promise((done) => setTimeout(done, 65_000));
    return api(path, init, true);
  }
  if (!response.ok) {
    const error = new Error(body?.message ?? `HTTP ${response.status} em ${path}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function apiUp() {
  try {
    await api('/profiles', { timeoutMs: 3_000 });
    return true;
  } catch {
    return false;
  }
}

/** Sobe a API compilada, se ela não estiver no ar. Devolve o processo, ou null. */
async function ensureApi(withAi) {
  if (await apiUp()) return null;

  await log('API parada: compilando e subindo.');
  await run('npm', ['run', 'build:shared']);
  await run('npm', ['run', 'build', '-w', 'recruiter-backend']);

  // A API lê o .env da pasta em que sobe: da raiz ela não acha o
  // DATABASE_URL e morre na validação (foi assim que o agente das 9h falhou
  // em 22 e 23/11). A saída vai para um log, para a próxima falha dizer o
  // motivo. Sem IA, a chave vai vazia: variável do processo vence o .env, e
  // chave vazia conta como ausente, então nada na API chama a Anthropic.
  const output = openSync(join(DIR, 'api.log'), 'a');
  const child = spawn('node', ['dist/main.js'], {
    cwd: join(ROOT, 'recruiter-backend'),
    stdio: ['ignore', output, output],
    env: withAi ? process.env : { ...process.env, ANTHROPIC_API_KEY: '' },
  });

  for (let i = 0; i < 60; i += 1) {
    if (await apiUp()) return child;
    await new Promise((done) => setTimeout(done, 2_000));
  }
  child.kill();
  throw new Error(`A API não respondeu em 2 minutos. Veja ${join(DIR, 'api.log')}.`);
}

function run(command, commandArgs) {
  return new Promise((done, fail) => {
    execFile(command, commandArgs, { cwd: ROOT, maxBuffer: 20e6 }, (error) =>
      error ? fail(error) : done(),
    );
  });
}

async function loadState() {
  try {
    return JSON.parse(await readFile(join(DIR, 'estado.json'), 'utf8'));
  } catch {
    return { analyzed: {}, found: {} };
  }
}

function notify(message) {
  // A mensagem vai como argumento, nunca dentro do código AppleScript: nome de
  // empresa com aspas não pode virar comando.
  return new Promise((done) =>
    execFile(
      'osascript',
      [
        '-e',
        'on run argv',
        '-e',
        'display notification (item 1 of argv) with title "Job Tracker" subtitle (item 2 of argv)',
        '-e',
        'end run',
        message,
        'Veja em Minhas vagas, Seleção do agente',
      ],
      () => done(),
    ),
  );
}

async function main(options) {
  await log(
    options.ai
      ? `Início COM IA: meta de ${options.top} vagas forte ou boa, teto de ${options.maxAnalyses} análises, currículo adaptado ${options.tailor ? `ligado (até ${options.maxTailored})` : 'desligado'}.`
      : `Início sem IA: até ${options.top} vagas novas para a Seleção do agente. Nenhuma chamada paga.`,
  );
  if (options.ignored.length) {
    await log(`Ignorado sem a IA ligada: ${options.ignored.join(', ')}.`);
  }

  const started = await ensureApi(options.ai);

  try {
    const profiles = await api('/profiles');
    const profile =
      profiles.find((p) => p.id === process.env.AGENTE_PERFIL) ??
      profiles.find((p) => p.isDefault) ??
      profiles[0];
    if (!profile) throw new Error('Nenhum perfil cadastrado.');

    const state = await loadState();
    const summary = await runRound({ api, profileId: profile.id, options, state, today, log });
    const todayView = await api(`/today?profileId=${encodeURIComponent(profile.id)}`);

    if (summary.failedSources.length) {
      await log(`Fontes que falharam nesta rodada: ${summary.failedSources.join(', ')}.`);
    }
    await writeFile(join(DIR, 'estado.json'), JSON.stringify(state, null, 2));

    const analyzed = summary.analyses.filter((a) => a.fit).length;
    const good = summary.analyses.filter((a) => ['forte', 'boa'].includes(a.fit?.verdict)).length;
    const tailored = summary.analyses.filter((a) => a.tailored).length;
    const message = options.ai
      ? `${analyzed} vagas analisadas, ${good} boas ou fortes, ${tailored} currículos adaptados. ${todayView.emailActions.length} emails pedem ação.`
      : `${summary.found.length} vagas novas, encontradas sem IA. ${todayView.emailActions.length} emails pedem ação.`;
    await log(`Fim: ${message}`);

    if (options.notify) await notify(message);
  } finally {
    if (started) {
      started.kill();
      await log('API que o agente subiu foi encerrada.');
    }
  }
}

let options = { notify: true };
await mkdir(DIR, { recursive: true });
try {
  options = parseOptions(process.argv.slice(2));
  await main(options);
} catch (error) {
  await log(`ERRO: ${error.message}`);
  if (options.notify) await notify(`O agente falhou: ${plain(error.message, 120)}`);
  process.exitCode = 1;
}
