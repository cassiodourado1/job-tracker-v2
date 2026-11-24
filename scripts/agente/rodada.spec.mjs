import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions } from './opcoes.mjs';
import { freeOnly, PAID_PATHS, runRound } from './rodada.mjs';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');

/** Vagas SINTÉTICAS, como a busca devolve. */
const JOBS = [
  { url: 'https://vagas.exemplo.example/1', company: 'Empresa Um', title: 'Desenvolvedora Front-end Sênior', postedAt: '2026-11-22T10:00:00.000Z' },
  { url: 'https://vagas.exemplo.example/2', company: 'Empresa Dois', title: 'Desenvolvedor Java Sênior', postedAt: '2026-11-22T10:00:00.000Z' },
  { url: 'https://vagas.exemplo.example/3', company: 'Empresa Três', title: 'Engenheira React', postedAt: '2026-11-21T10:00:00.000Z', others: [] },
  { url: 'https://vagas.exemplo.example/4', company: 'Empresa Quatro', title: 'Front-end Vue', postedAt: '2026-09-01T10:00:00.000Z' },
  { url: 'https://vagas.exemplo.example/5', company: 'Empresa Cinco', title: 'Desenvolvedor Next.js', postedAt: null },
];

/** API falsa: registra cada rota chamada e responde como o app. */
function fakeApi(verdicts = {}) {
  const calls = [];
  let next = 0;
  const api = async (path, init = {}) => {
    calls.push({ path, body: init.body ? JSON.parse(init.body) : null });
    if (path.startsWith('/jobs/discover')) return { items: JOBS, nextCursor: null, failedSources: [] };
    if (path === '/jobs/saved') return { jobId: `vaga-${(next += 1)}` };
    if (path === '/job-fit') {
      const { jobId } = JSON.parse(init.body);
      return { verdict: verdicts[jobId] ?? 'parcial' };
    }
    if (path === '/tailored-resume') return { resume: {} };
    if (path === '/tailored-resume/save') return {};
    throw new Error(`rota inesperada: ${path}`);
  };
  return { api, calls };
}

const run = (options, api, state = {}) =>
  runRound({ api, profileId: 'perfil', options, state, today: '2026-11-23', log: async () => {}, now: NOW });

test('o modo padrão não chama nenhuma rota paga', async () => {
  const { api, calls } = fakeApi();

  const summary = await run(parseOptions([]), api);

  const paid = calls.filter((c) => PAID_PATHS.some((p) => c.path.startsWith(p)));
  assert.deepEqual(paid, []);
  assert.equal(summary.analyses.length, 0);
});

test('o modo padrão salva as vagas filtradas com origem "agente", sem veredito', async () => {
  const { api, calls } = fakeApi();
  const state = {};

  const summary = await run(parseOptions([]), api, state);

  const saves = calls.filter((c) => c.path === '/jobs/saved').map((c) => c.body);
  // Java sai pelo título; a de setembro sai pela idade; sem data entra.
  assert.deepEqual(
    saves.map((s) => s.result.company),
    ['Empresa Um', 'Empresa Três', 'Empresa Cinco'],
  );
  assert.ok(saves.every((s) => s.origin === 'agente'));
  assert.ok(saves.every((s) => !('others' in s.result)));
  assert.equal(summary.found.length, 3);
  assert.ok(state.found['https://vagas.exemplo.example/1']);
});

test('o modo padrão respeita --top e não repete vaga de outro dia', async () => {
  const { api, calls } = fakeApi();
  const state = { found: { 'https://vagas.exemplo.example/1': { date: '2026-11-22' } } };

  await run(parseOptions(['--top', '1']), api, state);

  const saves = calls.filter((c) => c.path === '/jobs/saved').map((c) => c.body.result.company);
  assert.deepEqual(saves, ['Empresa Três']);
});

test('a trava recusa rota paga mesmo se o código acima errar', async () => {
  const guarded = freeOnly(async () => 'chamou');

  assert.throws(() => guarded('/job-fit', {}), /Chamada paga bloqueada/);
  assert.throws(() => guarded('/tailored-resume/save', {}), /Chamada paga bloqueada/);
  assert.equal(await guarded('/jobs/saved', {}), 'chamou');
});

test('com --com-ia analisa, mas não adapta currículo sem --com-curriculo', async () => {
  const { api, calls } = fakeApi({ 'vaga-1': 'forte' });

  await run(parseOptions(['--com-ia']), api);

  assert.ok(calls.some((c) => c.path === '/job-fit'));
  assert.ok(!calls.some((c) => c.path.startsWith('/tailored-resume')));
});

test('com --com-ia --com-curriculo, adapta só as forte e boa', async () => {
  const { api, calls } = fakeApi({ 'vaga-1': 'forte', 'vaga-2': 'parcial', 'vaga-3': 'boa' });

  await run(parseOptions(['--com-ia', '--com-curriculo']), api);

  const tailored = calls.filter((c) => c.path === '/tailored-resume').map((c) => c.body.jobId);
  assert.deepEqual(tailored, ['vaga-1', 'vaga-3']);
});

test('com --com-ia, o teto limita a quantidade de análises', async () => {
  const { api, calls } = fakeApi();

  await run(parseOptions(['--com-ia', '--teto', '2']), api);

  assert.equal(calls.filter((c) => c.path === '/job-fit').length, 2);
});
