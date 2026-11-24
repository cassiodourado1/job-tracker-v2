/**
 * Uma rodada do agente diário, sem rede própria: tudo passa pelo `api`
 * recebido, o que deixa testar a rodada com uma API falsa.
 *
 * Sem IA (o padrão), a rodada lê a busca, filtra e salva as vagas novas com
 * origem "agente": elas aparecem em Minhas vagas, na Seleção do agente,
 * marcadas como encontradas sem IA, para você escolher quais analisar.
 * Nenhum veredito é inventado. Com IA (`--com-ia`), cada vaga salva passa
 * pela análise de aderência, até a meta ou o teto de análises.
 *
 * O agente nunca candidata, nunca envia formulário e nunca acessa o
 * LinkedIn: as vagas de lá chegam só pelos alertas de email que a busca lê
 * (§5).
 */
import { isFresh, onTrack, MAX_AGE_DAYS } from './triagem.mjs';

/** As rotas que chamam a Anthropic. Sem `--com-ia`, nenhuma delas é chamada. */
export const PAID_PATHS = ['/job-fit', '/tailored-resume'];

const GOOD_VERDICTS = ['forte', 'boa'];

/**
 * Trava do modo gratuito: a rodada sem IA não deveria chamar rota paga, e
 * esta camada garante isso mesmo se um dia o código acima errar. Falha alto
 * em vez de gastar.
 */
export function freeOnly(api) {
  return (path, init) => {
    if (PAID_PATHS.some((paid) => path.startsWith(paid))) {
      throw new Error(`Chamada paga bloqueada sem --com-ia: ${path}`);
    }
    return api(path, init);
  };
}

/** Texto de terceiros vai para o log como dado: sem quebra de linha nem marcação. */
export function plain(text, max = 300) {
  return String(text ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[`*[\]<>|#]/g, '')
    .slice(0, max)
    .trim();
}

/** Falta de crédito ou chave recusada: todas as próximas análises falhariam igual. */
function fatal(error) {
  return /crédito|ANTHROPIC_API_KEY|chave/i.test(error.message ?? '');
}

export async function runRound({ api: rawApi, profileId, options, state, today, log, now = Date.now() }) {
  const api = options.ai ? rawApi : freeOnly(rawApi);
  state.analyzed ??= {};
  state.found ??= {};

  // Todas as páginas da busca, das mais novas para as mais antigas: vaga
  // nova é a com menos gente concorrendo. A busca guarda a rodada em cache,
  // então as páginas seguintes saem rápido.
  const discover = { items: [], failedSources: [] };
  let cursor = null;
  for (let page = 0; page < 60; page += 1) {
    const query = new URLSearchParams({ profileId, sort: 'recentes' });
    if (cursor) query.set('cursor', cursor);
    const result = await api(`/jobs/discover?${query}`, { timeoutMs: 180_000 });
    discover.items.push(...result.items);
    discover.failedSources = result.failedSources;
    cursor = result.nextCursor;
    if (!cursor) break;
  }

  // A busca já tirou o que você salvou, aplicou ou descartou. Aqui sai o que
  // o agente já viu em outro dia: vaga que você tirou de Minhas vagas não
  // volta sozinha no dia seguinte.
  const unseen = discover.items.filter((job) => !state.analyzed[job.url] && !state.found[job.url]);
  const onTrackJobs = unseen.filter(onTrack);
  const queue = onTrackJobs.filter((job) => isFresh(job, now));
  await log(
    `Busca: ${discover.items.length} vagas lidas, ${unseen.length} novas para o agente, ${onTrackJobs.length} no seu perfil pelo título, ${queue.length} publicadas nos últimos ${MAX_AGE_DAYS} dias ou sem data.`,
  );

  const summary = { read: discover.items.length, queue: queue.length, found: [], analyses: [], failedSources: discover.failedSources };

  const save = async (job) => {
    const { others: _others, ...result } = job;
    return api('/jobs/saved', {
      method: 'POST',
      // A origem é o que põe a vaga na "Seleção do agente" do app.
      body: JSON.stringify({ profileId, result, origin: 'agente' }),
    });
  };

  if (!options.ai) {
    for (const job of queue.slice(0, options.top)) {
      try {
        const saved = await save(job);
        state.found[job.url] = { date: today };
        summary.found.push({ job, jobId: saved.jobId });
        await log(`Encontrada (sem IA): ${plain(job.company, 60)} · ${plain(job.title, 80)}`);
      } catch (error) {
        await log(`Não consegui salvar ${plain(job.company, 60)}: ${error.message}`);
      }
    }
    return summary;
  }

  const analyses = summary.analyses;
  const isGood = (a) => GOOD_VERDICTS.includes(a.fit?.verdict);
  const attempted = () => analyses.filter((a) => a.fit || (a.error && !a.skipped)).length;

  for (const job of queue) {
    if (analyses.filter(isGood).length >= options.top) break;
    if (attempted() >= options.maxAnalyses) {
      await log(`Teto de ${options.maxAnalyses} análises atingido.`);
      break;
    }
    let saved = null;
    try {
      saved = await save(job);
      const fit = await api('/job-fit', {
        method: 'POST',
        body: JSON.stringify({ profileId, jobId: saved.jobId, origin: 'agente' }),
        timeoutMs: 180_000,
      });
      const entry = { job, fit, jobId: saved.jobId };
      analyses.push(entry);
      state.analyzed[job.url] = { date: today, verdict: fit.verdict };
      await log(`Analisada: ${plain(job.company, 60)} → ${fit.verdict}`);

      // Currículo só com --com-curriculo, só nas forte e boa, e com teto
      // próprio: passar na análise não basta para gastar com currículo.
      if (
        options.tailor &&
        isGood(entry) &&
        analyses.filter((a) => a.tailored).length < options.maxTailored
      ) {
        try {
          const proposal = await api('/tailored-resume', {
            method: 'POST',
            body: JSON.stringify({ profileId, jobId: saved.jobId }),
            timeoutMs: 180_000,
          });
          await api('/tailored-resume/save', {
            method: 'POST',
            body: JSON.stringify({ profileId, jobId: saved.jobId, resume: proposal.resume }),
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
      if (permanent) state.analyzed[job.url] = { date: today, skipped: error.message };
      await log(`Falhou a análise de ${plain(job.company, 60)}: ${error.message}`);
      // Vaga salva some da busca: sem desfazer, uma falha (chave inválida,
      // rede) esconderia a vaga para sempre do agente e de você.
      if (saved) {
        await api(
          `/jobs/saved/${encodeURIComponent(saved.jobId)}?profileId=${encodeURIComponent(profileId)}`,
          { method: 'DELETE' },
        ).catch(() => log(`Não consegui desfazer o salvamento de ${plain(job.company, 60)}.`));
      }
      if (fatal(error)) {
        await log('Parando: sem crédito ou chave recusada, as próximas falhariam igual.');
        break;
      }
    }
  }

  return summary;
}
