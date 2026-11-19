#!/usr/bin/env node
/**
 * Agente diário: lê as vagas que o próprio app já agrupa, analisa as melhores
 * com o Claude e avisa por notificação do macOS.
 *
 * O que ele FAZ:
 * - pede à API local a primeira rodada da descoberta, ordenada por relevância
 *   (a pontuação por código do §1.4, sem custo);
 * - salva as N melhores que ainda não foram analisadas e pede a análise de
 *   aderência de cada uma (paga: é o Claude com o currículo inteiro);
 * - para as de aderência forte ou boa, gera e salva o currículo adaptado à
 *   vaga (também pago). Ele aparece na página da vaga no app, pronto para
 *   revisar e imprimir em PDF, e é o que fica registrado quando você
 *   registrar a candidatura;
 * - avisa por notificação quantas vagas analisou e quantos emails pedem ação.
 *
 * O resultado fica DENTRO do app, não num arquivo: cada análise é guardada
 * com origem "agente", e Minhas vagas mostra a "Seleção do agente" com o
 * veredito, o resumo e o currículo adaptado, até você marcar "Já me
 * candidatei". Em ~/agente-vagas ficam só o log e o estado do agente.
 *
 * O que ele NUNCA faz: candidatar, enviar formulário, descartar vaga ou mudar
 * status de candidatura. O §5 proíbe envio automático, e o agente só prepara
 * o terreno para a sua decisão.
 *
 * Só fala com 127.0.0.1. Se a API estiver parada, sobe uma, e a derruba no
 * fim. Subir a API dispara a sincronização de email do boot, que é a mesma de
 * quando você a inicia à mão.
 *
 * Uso: node scripts/agente-diario.mjs [--top 5] [--sem-analise] [--sem-curriculo] [--sem-aviso]
 * Variáveis: AGENTE_API (padrão http://127.0.0.1:3333), AGENTE_PERFIL (id do
 * perfil; padrão o perfil marcado como padrão), AGENTE_DIR (padrão
 * ~/agente-vagas).
 */
import { spawn, execFile } from 'node:child_process';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.AGENTE_API ?? 'http://127.0.0.1:3333';
const DIR = process.env.AGENTE_DIR ?? join(homedir(), 'agente-vagas');
const args = process.argv.slice(2);
const TOP = Number(valueOf('--top') ?? 5);
const ANALYZE = !args.includes('--sem-analise');
const NOTIFY = !args.includes('--sem-aviso');
const TAILOR = ANALYZE && !args.includes('--sem-curriculo');
/** Só vale adaptar currículo para vaga em que a análise viu chance real. */
const TAILOR_VERDICTS = ['forte', 'boa'];

/** A API escuta só em loopback (§2); qualquer outro endereço é engano. */
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  throw new Error(`AGENTE_API precisa ser local, recebi ${API}`);
}
if (!Number.isInteger(TOP) || TOP < 0 || TOP > 20) {
  throw new Error('--top precisa ser um inteiro entre 0 e 20.');
}

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
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
  // A análise e a adaptação aceitam 10 chamadas por minuto. Com 20 vagas por
  // dia o limite pode chegar: espera a janela passar e tenta uma vez mais, em
  // vez de perder a vaga do dia.
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
async function ensureApi() {
  if (await apiUp()) return null;

  await log('API parada: compilando e subindo.');
  await run('npm', ['run', 'build:shared']);
  await run('npm', ['run', 'build', '-w', 'recruiter-backend']);

  const child = spawn('node', ['recruiter-backend/dist/main.js'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  for (let i = 0; i < 60; i += 1) {
    if (await apiUp()) return child;
    await new Promise((done) => setTimeout(done, 2_000));
  }
  child.kill();
  throw new Error('A API não respondeu em 2 minutos.');
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
    return { analyzed: {} };
  }
}

/** Texto de terceiros vai para o relatório como dado: sem quebra de linha nem marcação. */
function plain(text, max = 300) {
  return String(text ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[`*[\]<>|#]/g, '')
    .slice(0, max)
    .trim();
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

async function main() {
  await mkdir(DIR, { recursive: true });
  await log(`Início: top ${TOP}, análise ${ANALYZE ? 'ligada' : 'desligada'}.`);

  const started = await ensureApi();

  try {
    const profiles = await api('/profiles');
    const profile =
      profiles.find((p) => p.id === process.env.AGENTE_PERFIL) ??
      profiles.find((p) => p.isDefault) ??
      profiles[0];
    if (!profile) throw new Error('Nenhum perfil cadastrado.');

    const state = await loadState();
    const discover = await api(
      `/jobs/discover?profileId=${encodeURIComponent(profile.id)}&sort=relevancia`,
      { timeoutMs: 180_000 },
    );

    // A descoberta já tira o que você salvou, aplicou ou descartou; aqui sai
    // também o que o agente analisou em dias anteriores.
    const fresh = discover.items.filter((job) => !state.analyzed[job.url]);
    const analyses = [];
    // Sem análise, o topo é só a lista. Com análise, vaga recusada por falta de
    // descrição não ocupa vaga do dia: o agente segue para a próxima, até um
    // limite, para não varrer a lista inteira num dia ruim.
    const picked = [];
    const candidates = ANALYZE ? fresh.slice(0, TOP + 5) : fresh.slice(0, TOP);

    for (const job of candidates) {
      if (picked.length - analyses.filter((a) => a.skipped).length >= TOP) break;
      picked.push(job);
      if (!ANALYZE) continue;
      let saved = null;
      try {
        const { others: _others, ...result } = job;
        saved = await api('/jobs/saved', {
          method: 'POST',
          body: JSON.stringify({ profileId: profile.id, result }),
        });
        const fit = await api('/job-fit', {
          method: 'POST',
          // A origem é o que põe a vaga na "Seleção do agente" do app.
          body: JSON.stringify({ profileId: profile.id, jobId: saved.jobId, origin: 'agente' }),
          timeoutMs: 180_000,
        });
        const entry = { job, fit, jobId: saved.jobId };
        analyses.push(entry);
        state.analyzed[job.url] = { date: today, verdict: fit.verdict };
        await log(`Analisada: ${plain(job.company, 60)} → ${fit.verdict}`);

        if (TAILOR && TAILOR_VERDICTS.includes(fit.verdict)) {
          // Falha aqui não desfaz a análise: a vaga continua salva e você
          // adapta à mão na página dela.
          try {
            const proposal = await api('/tailored-resume', {
              method: 'POST',
              body: JSON.stringify({ profileId: profile.id, jobId: saved.jobId }),
              timeoutMs: 180_000,
            });
            await api('/tailored-resume/save', {
              method: 'POST',
              body: JSON.stringify({
                profileId: profile.id,
                jobId: saved.jobId,
                resume: proposal.resume,
              }),
            });
            entry.tailored = true;
            await log(`Currículo adaptado salvo: ${plain(job.company, 60)}`);
          } catch (error) {
            entry.tailorError = error.message;
            await log(`Falhou o currículo de ${plain(job.company, 60)}: ${error.message}`);
          }
        }
      } catch (error) {
        // 400 da análise é defeito da vaga (sem descrição): não adianta tentar
        // amanhã. 5xx é chave, rede ou API fora: tenta de novo no próximo dia.
        const permanent = error.status === 400;
        analyses.push({ job, error: error.message, skipped: permanent });
        if (permanent) {
          state.analyzed[job.url] = { date: today, skipped: error.message };
        }
        await log(`Falhou a análise de ${plain(job.company, 60)}: ${error.message}`);
        // Vaga salva some da descoberta: sem desfazer, uma falha (chave
        // inválida, rede) esconderia a vaga para sempre do agente e de você.
        if (saved) {
          await api(
            `/jobs/saved/${encodeURIComponent(saved.jobId)}?profileId=${encodeURIComponent(profile.id)}`,
            { method: 'DELETE' },
          ).catch(() => log(`Não consegui desfazer o salvamento de ${plain(job.company, 60)}.`));
        }
      }
    }

    const todayView = await api(
      `/today?profileId=${encodeURIComponent(profile.id)}`,
    );

    const good = analyses.filter((a) => ['forte', 'boa'].includes(a.fit?.verdict));
    if (discover.failedSources.length) {
      await log(`Fontes que falharam nesta rodada: ${discover.failedSources.join(', ')}.`);
    }
    await writeFile(join(DIR, 'estado.json'), JSON.stringify(state, null, 2));
    await log(
      `Fim: ${analyses.filter((a) => a.fit).length} analisadas, ${good.length} boas ou fortes, ${analyses.filter((a) => a.tailored).length} currículos adaptados.`,
    );

    if (NOTIFY) {
      await notify(
        ANALYZE
          ? `${analyses.filter((a) => a.fit).length} vagas analisadas, ${good.length} boas ou fortes, ${analyses.filter((a) => a.tailored).length} currículos adaptados. ${todayView.emailActions.length} emails pedem ação.`
          : `${picked.length} vagas no topo. ${todayView.emailActions.length} emails pedem ação.`,
      );
    }
  } finally {
    if (started) {
      started.kill();
      await log('API que o agente subiu foi encerrada.');
    }
  }
}

main().catch(async (error) => {
  await mkdir(DIR, { recursive: true });
  await log(`ERRO: ${error.message}`);
  if (NOTIFY) await notify(`O agente falhou: ${plain(error.message, 120)}`);
  process.exitCode = 1;
});
