import type { ApplicationFacts } from '@recruit/shared';
import { buildFunnel } from './funnel';

/**
 * Os casos abaixo saíram do banco real, não de imaginação — inclusive o loop
 * `rejeitado → rascunho → rejeitado`, que existe de verdade e é o que quebra
 * uma contagem por eventos.
 */

/** Uma candidatura com os degraus por onde passou e onde está agora. */
function cand(
  applicationId: string,
  reached: string[],
  status = reached[reached.length - 1] ?? 'rascunho',
): ApplicationFacts {
  return { applicationId, reached, status } as ApplicationFacts;
}

/** Abaixo deste número as taxas vêm nulas; quase todo teste quer elas ligadas. */
const COM_TAXAS = 1;

function etapa(funil: ReturnType<typeof buildFunnel>, nome: string) {
  const passo = funil.find((f) => f.stage === nome);

  if (!passo) {
    throw new Error(`etapa ${nome} não existe no funil`);
  }

  return passo;
}

describe('buildFunnel', () => {
  it('conta quem JÁ CHEGOU, não quem está agora', () => {
    // Caso real: uma candidatura que caminhou até a oferta. Contar o status
    // atual reportaria só `oferta` e apagaria entrevista e teste.
    const funil = buildFunnel(
      [cand('app-1', ['rascunho', 'entrevista', 'teste', 'oferta'])],
      COM_TAXAS,
    );

    expect(etapa(funil, 'entrevista').reached).toBe(1);
    expect(etapa(funil, 'teste').reached).toBe(1);
    expect(etapa(funil, 'oferta').reached).toBe(1);
  });

  it('candidatura SEM evento nenhum ainda entra pelo status atual', () => {
    // Linha de seed, de migration ou editada no Studio não tem `StatusEvent`.
    // Sem somar o status atual ao máximo, ela sumiria do funil sem erro.
    const funil = buildFunnel([cand('app-1', [], 'oferta')], COM_TAXAS);

    expect(etapa(funil, 'oferta').reached).toBe(1);
    expect(etapa(funil, 'aplicado').reached).toBe(1);
  });

  it('pular uma etapa não faz o funil crescer', () => {
    const funil = buildFunnel(
      [cand('app-1', ['aplicado', 'entrevista'])],
      COM_TAXAS,
    );

    expect(etapa(funil, 'aplicado').reached).toBe(1);
    expect(etapa(funil, 'triagem').reached).toBe(1);
    expect(etapa(funil, 'entrevista').reached).toBe(1);
    expect(etapa(funil, 'teste').reached).toBe(0);
  });

  it('é monotônico: nenhuma etapa supera a anterior', () => {
    const funil = buildFunnel(
      [
        cand('app-1', ['aplicado']),
        cand('app-2', ['entrevista']),
        cand('app-3', ['oferta']),
        cand('app-4', ['triagem']),
      ],
      COM_TAXAS,
    );

    const valores = funil.map((f) => f.reached);

    expect(valores).toEqual([...valores].sort((a, b) => b - a));
    expect(funil.every((f) => f.conversion === null || f.conversion <= 1)).toBe(
      true,
    );
  });

  it('o laço rejeitado → rascunho → rejeitado conta uma candidatura', () => {
    // Existe no banco real. Contar eventos daria dois.
    const funil = buildFunnel(
      [cand('app-1', ['rejeitado', 'rascunho', 'rejeitado', 'aplicado'])],
      COM_TAXAS,
    );

    expect(etapa(funil, 'aplicado').reached).toBe(1);
  });

  it('reentrar numa etapa não conta duas vezes', () => {
    const funil = buildFunnel(
      [cand('app-1', ['aplicado', 'rascunho', 'aplicado'])],
      COM_TAXAS,
    );

    expect(etapa(funil, 'aplicado').reached).toBe(1);
  });

  it('duas candidaturas na mesma etapa contam duas', () => {
    // Contrapeso do teste acima: deduplicar por candidatura não pode virar
    // deduplicar por etapa.
    const funil = buildFunnel(
      [cand('app-1', ['aplicado']), cand('app-2', ['aplicado'])],
      COM_TAXAS,
    );

    expect(etapa(funil, 'aplicado').reached).toBe(2);
  });

  it('rejeitado não conta como profundidade', () => {
    // Rejeitada na triagem não pode aparecer como se tivesse chegado à oferta
    // só porque `rejeitado` vem depois no enum. É a mutação de maior dano.
    const funil = buildFunnel(
      [cand('app-1', ['aplicado', 'triagem', 'rejeitado'])],
      COM_TAXAS,
    );

    expect(etapa(funil, 'triagem').reached).toBe(1);
    expect(etapa(funil, 'entrevista').reached).toBe(0);
    expect(etapa(funil, 'oferta').reached).toBe(0);
  });

  it('cancelado não conta como profundidade', () => {
    // Mesmo risco do rejeitado, maior ainda: `cancelado` é o último do enum.
    const funil = buildFunnel(
      [cand('app-1', ['aplicado', 'teste', 'cancelado'])],
      COM_TAXAS,
    );

    expect(etapa(funil, 'teste').reached).toBe(1);
    expect(etapa(funil, 'oferta').reached).toBe(0);
  });

  it('rascunho não é degrau do funil', () => {
    const funil = buildFunnel([cand('app-1', ['rascunho'])], COM_TAXAS);

    expect(funil.map((f) => f.stage)).not.toContain('rascunho');
    expect(etapa(funil, 'aplicado').reached).toBe(0);
  });

  it('calcula a conversão entre etapas', () => {
    const funil = buildFunnel(
      [
        cand('app-1', ['aplicado']),
        cand('app-2', ['aplicado']),
        cand('app-3', ['aplicado']),
        cand('app-4', ['triagem']),
      ],
      COM_TAXAS,
    );

    expect(etapa(funil, 'aplicado').reached).toBe(4);
    expect(etapa(funil, 'triagem').reached).toBe(1);
    expect(etapa(funil, 'triagem').conversion).toBeCloseTo(0.25);
  });

  it('abaixo do mínimo, a taxa vem NULA e não um percentual', () => {
    // O corte vive no contrato: a tela não pode imprimir o que o backend
    // considera ruído. "75%" sobre quatro candidaturas é precisão inventada.
    const poucas = [
      cand('app-1', ['aplicado']),
      cand('app-2', ['aplicado']),
      cand('app-3', ['triagem']),
    ];

    expect(buildFunnel(poucas, 10).every((f) => f.conversion === null)).toBe(
      true,
    );
    expect(etapa(buildFunnel(poucas, 3), 'triagem').conversion).not.toBeNull();
  });

  it('conversão é nula, não zero, quando não há de onde converter', () => {
    const funil = buildFunnel([], COM_TAXAS);

    expect(etapa(funil, 'aplicado').conversion).toBeNull();
    expect(etapa(funil, 'triagem').conversion).toBeNull();
    expect(funil.every((f) => f.reached === 0)).toBe(true);
  });

  it('o estado real de hoje: quatro aplicadas e nada além', () => {
    const funil = buildFunnel(
      ['app-1', 'app-2', 'app-3', 'app-4'].map((id) => cand(id, ['aplicado'])),
      COM_TAXAS,
    );

    expect(funil.map((f) => f.reached)).toEqual([4, 0, 0, 0, 0]);
  });
});
