import type { ApplicationStatus } from '@recruit/shared';
import {
  isActionable,
  pickSuggestions,
  type SuggestionFacts,
} from './suggestion';

const EMAIL = new Date('2026-08-27T12:00:00Z');
const ANTES = new Date('2026-08-20T12:00:00Z');
const DEPOIS = new Date('2026-08-28T12:00:00Z');

function fato(
  suggested: ApplicationStatus,
  current: ApplicationStatus,
  extra: Partial<SuggestionFacts> = {},
): SuggestionFacts {
  return {
    emailId: 'e1',
    applicationId: 'a1',
    suggested,
    current,
    receivedAt: EMAIL,
    events: [],
    ...extra,
  };
}

describe('isActionable', () => {
  it('recusa de uma candidatura em aplicado é notícia', () => {
    // O caso real que motivou a feature: a recusa chegou e nada mudou.
    expect(isActionable(fato('rejeitado', 'aplicado'))).toBe(true);
  });

  it('sugerir o status em que ela já está não é notícia', () => {
    expect(isActionable(fato('entrevista', 'entrevista'))).toBe(false);
  });

  it('não reabre candidatura encerrada', () => {
    expect(isActionable(fato('entrevista', 'rejeitado'))).toBe(false);
  });

  it('some quando você registrou uma resposta depois do email', () => {
    expect(
      isActionable(
        fato('rejeitado', 'triagem', {
          events: [{ toStatus: 'triagem', occurredAt: DEPOIS }],
        }),
      ),
    ).toBe(false);
  });

  it('continua quando a última resposta registrada foi antes do email', () => {
    expect(
      isActionable(
        fato('rejeitado', 'triagem', {
          events: [{ toStatus: 'triagem', occurredAt: ANTES }],
        }),
      ),
    ).toBe(true);
  });

  it('marcar como aplicado depois do email não é "já li a notícia"', () => {
    // O caso real: a plataforma respondeu na hora e a candidatura foi
    // registrada 31 segundos depois. A sugestão sumia.
    expect(
      isActionable(
        fato('teste', 'aplicado', {
          events: [
            { toStatus: 'rascunho', occurredAt: DEPOIS },
            { toStatus: 'aplicado', occurredAt: DEPOIS },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('email antigo não puxa a candidatura para trás no funil', () => {
    expect(isActionable(fato('triagem', 'entrevista'))).toBe(false);
  });

  it('avançar no funil é notícia', () => {
    expect(isActionable(fato('entrevista', 'triagem'))).toBe(true);
  });

  it('rejeição vale a partir de qualquer etapa, até da oferta', () => {
    expect(isActionable(fato('rejeitado', 'oferta'))).toBe(true);
  });

  it('cancelamento também vale a partir de qualquer etapa', () => {
    // `cancelado` vem depois de tudo no enum, mas não é por isso que passa:
    // passa porque encerra. O teste de baixo prova que não é a profundidade.
    expect(isActionable(fato('cancelado', 'teste'))).toBe(true);
  });

  it('vaga cancelada também não reabre', () => {
    expect(isActionable(fato('entrevista', 'cancelado'))).toBe(false);
  });

  it('recusa não sobrescreve um cancelamento já registrado, nem o contrário', () => {
    expect(isActionable(fato('rejeitado', 'cancelado'))).toBe(false);
    expect(isActionable(fato('cancelado', 'rejeitado'))).toBe(false);
  });

  it('cancelamento registrado depois do email conta como "já li"', () => {
    expect(
      isActionable(
        fato('triagem', 'aplicado', {
          events: [{ toStatus: 'cancelado', occurredAt: DEPOIS }],
        }),
      ),
    ).toBe(false);
  });
});

describe('pickSuggestions', () => {
  it('uma por candidatura, a do email mais recente', () => {
    const picked = pickSuggestions([
      fato('triagem', 'aplicado', { emailId: 'velho', receivedAt: ANTES }),
      fato('entrevista', 'aplicado', { emailId: 'novo', receivedAt: DEPOIS }),
    ]);

    expect(picked.map((row) => row.emailId)).toEqual(['novo']);
  });

  it('um email novo que não vale não esconde um antigo que vale', () => {
    // Filtrar depois de escolher perderia a recusa: o email mais novo repete
    // o status atual e seria o escolhido.
    const picked = pickSuggestions([
      fato('rejeitado', 'triagem', { emailId: 'recusa', receivedAt: ANTES }),
      fato('triagem', 'triagem', { emailId: 'lembrete', receivedAt: DEPOIS }),
    ]);

    expect(picked.map((row) => row.emailId)).toEqual(['recusa']);
  });

  it('candidaturas diferentes não competem entre si', () => {
    const picked = pickSuggestions([
      fato('rejeitado', 'aplicado', { emailId: 'e1', applicationId: 'a1' }),
      fato('entrevista', 'aplicado', { emailId: 'e2', applicationId: 'a2' }),
    ]);

    expect(picked).toHaveLength(2);
  });
});
