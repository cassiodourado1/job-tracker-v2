import { emptyResume, type Resume } from '@recruit/shared';
import { fingerprint, labelFor, snapshotOf } from './resume-snapshot';

function resume(over: Partial<Resume> = {}): Resume {
  return { ...emptyResume, ...over };
}

describe('snapshotOf', () => {
  it('congela um currículo preenchido', () => {
    const snapshot = snapshotOf(resume({ skills: ['Node.js'] }));

    expect(snapshot?.skills).toEqual(['Node.js']);
  });

  it('currículo vazio não vira versão', () => {
    // Uma linha sem conteúdo afirmaria que você enviou um currículo em branco.
    // Não afirmar nada é mais honesto.
    expect(snapshotOf(resume())).toBeNull();
  });

  it('currículo ausente ou corrompido não vira versão', () => {
    expect(snapshotOf(null)).toBeNull();
    expect(snapshotOf({ skills: 'não é lista' })).toBeNull();
  });

  it('uma única seção preenchida já basta', () => {
    expect(snapshotOf(resume({ summary: 'Dev' }))).not.toBeNull();
    expect(
      snapshotOf(resume({ languages: [{ name: 'Inglês', level: null }] })),
    ).not.toBeNull();
  });
});

describe('fingerprint', () => {
  it('currículo igual dá a mesma impressão', () => {
    expect(fingerprint(resume({ skills: ['Go'] }))).toBe(
      fingerprint(resume({ skills: ['Go'] })),
    );
  });

  it('ordem das chaves não muda a impressão', () => {
    // O Prisma não garante a ordem das chaves de um Json. Sem estabilizar,
    // cada candidatura criaria uma versão nova sem você ter mudado nada.
    const a: Resume = { ...emptyResume, skills: ['Go'] };
    const b = Object.fromEntries(Object.entries(a).reverse()) as Resume;

    // Mesmo conteúdo, chaves em ordem inversa — confere que o teste testa.
    expect(Object.keys(b)).not.toEqual(Object.keys(a));
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('mudança de conteúdo muda a impressão', () => {
    expect(fingerprint(resume({ skills: ['Go'] }))).not.toBe(
      fingerprint(resume({ skills: ['Go', 'Node.js'] })),
    );
  });
});

describe('labelFor', () => {
  it('nomeia pela data', () => {
    expect(labelFor(new Date('2026-09-23T15:00:00Z'))).toBe(
      'Currículo de 23/09/2026',
    );
  });
});
