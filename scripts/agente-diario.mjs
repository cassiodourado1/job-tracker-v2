#!/usr/bin/env node
/**
 * Agente diário: lê as vagas que o próprio app já agrupa, analisa as melhores
 * com o Claude e avisa por notificação do macOS.
 *
 * O que ele FAZ:
 * - lê a busca inteira da API local, das vagas mais novas para as mais
 *   antigas, e corta de graça, pelo título, o que é de outra trilha;
 * - salva e analisa uma a uma (paga: é o Claude com o currículo inteiro) até
 *   achar N vagas forte ou boa, ou bater o teto de análises do dia;
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
/** Meta do dia: quantas vagas forte ou boa encontrar (não quantas analisar). */
const TOP = Number(valueOf('--top') ?? 5);
/**
 * Teto de análises pagas por dia. Sem ele, um dia sem vaga boa varreria a
 * lista inteira e zeraria o crédito, como aconteceu em 19/11.
 */
const MAX_ANALYSES = Number(valueOf('--teto') ?? 60);
/** Vaga mais velha que isto já tem gente demais concorrendo. Sem data entra no fim. */
const MAX_AGE_DAYS = 21;
const ANALYZE = !args.includes('--sem-analise');
const NOTIFY = !args.includes('--sem-aviso');
const TAILOR = ANALYZE && !args.includes('--sem-curriculo');
/** Só vale adaptar currículo para vaga em que a análise viu chance real. */
const TAILOR_VERDICTS = ['forte', 'boa'];

/** A API escuta só em loopback (§2); qualquer outro endereço é engano. */
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  throw new Error(`AGENTE_API precisa ser local, recebi ${API}`);
}
if (!Number.isInteger(TOP) || TOP < 0 || TOP > 50) {
  throw new Error('--top precisa ser um inteiro entre 0 e 50.');
}
if (!Number.isInteger(MAX_ANALYSES) || MAX_ANALYSES < 1 || MAX_ANALYSES > 500) {
  throw new Error('--teto precisa ser um inteiro entre 1 e 500.');
}

/**
 * Triagem de graça, pelo título, antes de pagar a análise. Corta o que é
 * claramente de outra trilha (back-end em outra linguagem, infra, dados, QA,
 * mobile nativo), a não ser que o título também fale de front-end: "Full
 * Stack React/Java" ainda vale a análise, "Desenvolvedor Java" não.
 */
const OFF_TRACK =
  /(\.net|\bc#|\bjava\b(?!script)|python|golang|\bgo\b|ruby|rails|scala|elixir|rust|kotlin|swift|\bios\b|android|flutter|devops|\bsre\b|infra|platform engineer|cloud engineer|data (engineer|scien|analyst)|engenheir[oa] de dados|cientista de dados|analista de dados|machine learning|\bml\b|\bqa\b|quality|tester|testes|sap\b|salesforce|abap|cobol|mainframe|delphi|protheus|power bi|blockchain|solidity|embedded|embarcad|security|seguran|back-?\s?end|\bvb6?\b|visual basic|\brpa\b|hubspot|\bcrm\b|neg[oó]cios|banking|(?:\bai\b|\bia\b) engineer|engineer,? ai|desenvolvedor(?:\(a\))? de ia|llm)/i;
const FRONT_TRACK =
  /(front|react|next|vue|nuxt|angular|typescript|javascript|drupal|wordpress|\bui\b|web)/i;

function onTrack(job) {
  return !OFF_TRACK.test(job.title) || FRONT_TRACK.test(job.title);
}

/** Até quando a vaga conta como nova. Sem data: conta, mas vem depois. */
function fresh(job) {
  if (!job.postedAt) return true;
  return Date.now() - Date.parse(job.postedAt) <= MAX_AGE_DAYS * 86_400_000;
}

/** Falta de crédito ou chave recusada: todas as próximas falhariam igual. */
function fatal(error) {
  return /crédito|ANTHROPIC_API_KEY|chave/i.test(error.message ?? '');
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
  await log(
    `Início: meta de ${TOP} vagas forte ou boa, teto de ${MAX_ANALYSES} análises, análise ${ANALYZE ? 'ligada' : 'desligada'}.`,
  );

  const started = await ensureApi();

  try {
    const profiles = await api('/profiles');
    const profile =
      profiles.find((p) => p.id === process.env.AGENTE_PERFIL) ??
      profiles.find((p) => p.isDefault) ??
      profiles[0];
    if (!profile) throw new Error('Nenhum perfil cadastrado.');

    const state = await loadState();
    // Todas as páginas da busca, das mais novas para as mais antigas: a meta
    // é achar vaga boa, e vaga nova é a com menos gente concorrendo. A busca
    // guarda a rodada em cache, então as páginas seguintes saem rápido.
    const discover = { items: [], total: 0, failedSources: [] };
    let cursor = null;
    for (let page = 0; page < 60; page += 1) {
      const query = new URLSearchParams({ profileId: profile.id, sort: 'recentes' });
      if (cursor) query.set('cursor', cursor);
      const result = await api(`/jobs/discover?${query}`, { timeoutMs: 180_000 });
      discover.items.push(...result.items);
      discover.total = result.total;
      discover.failedSources = result.failedSources;
      cursor = result.nextCursor;
      if (!cursor) break;
    }

    // A descoberta já tira o que você salvou, aplicou ou descartou; aqui sai
    // também o que o agente analisou em dias anteriores, o que é de outra
    // trilha pelo título e o que é velho demais.
    const unseen = discover.items.filter((job) => !state.analyzed[job.url]);
    const onTrackJobs = unseen.filter(onTrack);
    const queue = onTrackJobs.filter(fresh);
    await log(
      `Busca: ${discover.items.length} vagas lidas, ${unseen.length} ainda não analisadas, ${onTrackJobs.length} no seu perfil pelo título, ${queue.length} publicadas nos últimos ${MAX_AGE_DAYS} dias ou sem data.`,
    );
    const analyses = [];
    const picked = [];
    const isGood = (a) => TAILOR_VERDICTS.includes(a.fit?.verdict);

    for (const job of ANALYZE ? queue : queue.slice(0, TOP)) {
      if (ANALYZE) {
        if (analyses.filter(isGood).length >= TOP) break;
        if (analyses.filter((a) => a.fit || (a.error && !a.skipped)).length >= MAX_ANALYSES) {
          await log(`Teto de ${MAX_ANALYSES} análises atingido.`);
          break;
        }
      }
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
        const stop = fatal(error);
        // Vaga salva some da descoberta: sem desfazer, uma falha (chave
        // inválida, rede) esconderia a vaga para sempre do agente e de você.
        if (saved) {
          await api(
            `/jobs/saved/${encodeURIComponent(saved.jobId)}?profileId=${encodeURIComponent(profile.id)}`,
            { method: 'DELETE' },
          ).catch(() => log(`Não consegui desfazer o salvamento de ${plain(job.company, 60)}.`));
        }
        if (stop) {
          await log('Parando: sem crédito ou chave recusada, as próximas falhariam igual.');
          break;
        }
      }
    }

    const todayView = await api(
      `/today?profileId=${encodeURIComponent(profile.id)}`,
    );

    const good = analyses.filter(isGood);
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
