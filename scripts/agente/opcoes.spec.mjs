import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions } from './opcoes.mjs';

test('sem opções, a IA fica desligada e nada pago roda', () => {
  const options = parseOptions([]);

  assert.equal(options.ai, false);
  assert.equal(options.tailor, false);
  assert.equal(options.top, 10);
  assert.equal(options.maxAnalyses, 0);
  assert.equal(options.maxTailored, 0);
});

test('a IA liga só com --com-ia', () => {
  const options = parseOptions(['--com-ia']);

  assert.equal(options.ai, true);
  assert.equal(options.tailor, false);
  assert.equal(options.top, 5);
  assert.equal(options.maxAnalyses, 60);
});

test('currículo adaptado exige a própria opção, além de --com-ia', () => {
  assert.equal(parseOptions(['--com-ia']).tailor, false);
  assert.equal(parseOptions(['--com-ia', '--com-curriculo']).tailor, true);
  assert.equal(parseOptions(['--com-ia', '--com-curriculo']).maxTailored, 10);
  assert.throws(() => parseOptions(['--com-curriculo']), /só vale junto com --com-ia/);
});

test('o agendamento antigo (--top 10 --teto 400) roda sem IA, com o teto ignorado', () => {
  const options = parseOptions(['--top', '10', '--teto', '400']);

  assert.equal(options.ai, false);
  assert.equal(options.top, 10);
  assert.deepEqual(options.ignored, ['--teto']);
});

test('opções antigas de desligar a IA continuam aceitas', () => {
  assert.equal(parseOptions(['--sem-analise', '--sem-curriculo']).ai, false);
});

test('opção digitada errada é erro, não um modo que ninguém pediu', () => {
  assert.throws(() => parseOptions(['--com-IA']), /Opção desconhecida/);
  assert.throws(() => parseOptions(['--comia']), /Opção desconhecida/);
});

test('valores fora da faixa são recusados', () => {
  assert.throws(() => parseOptions(['--top', '51']), /--top/);
  assert.throws(() => parseOptions(['--com-ia', '--teto', '0']), /--teto/);
  assert.throws(() => parseOptions(['--com-ia', '--com-curriculo', '--max-curriculos', '101']), /--max-curriculos/);
});
