import type { JobSearchResult } from '@recruit/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { DiscoveryService } from './discovery/discovery.service';
import { JobService } from './job.service';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('./discovery/discovery.service', () => ({
  DiscoveryService: class {},
}));

/** Vaga SINTÉTICA. */
const RESULT: JobSearchResult = {
  company: 'Empresa Exemplo',
  title: 'Dev Front-end',
  url: 'https://vagas.exemplo.example/123',
  source: 'gupy',
  description: 'Vaga de exemplo.',
  stack: ['React'],
  requirements: [],
  benefits: [],
  seniority: null,
  workModel: null,
  contractType: null,
  location: null,
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  weeklyHours: null,
  postedAt: null,
};

function service() {
  const upsert = jest.fn((args: { create: { origin: 'agente' | 'tela' } }) =>
    Promise.resolve({
      savedAt: new Date('2026-11-23T12:00:00.000Z'),
      origin: args.create.origin,
    }),
  );
  const tx = {
    profile: { findUnique: () => Promise.resolve({ id: 'perfil' }) },
    job: {
      findUnique: () => Promise.resolve(null),
      create: () =>
        Promise.resolve({
          ...RESULT,
          id: 'vaga',
          extractedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    },
    dismissedJob: { deleteMany: () => Promise.resolve({ count: 0 }) },
    savedJob: { upsert },
    jobFitAnalysis: { findUnique: () => Promise.resolve(null) },
    resumeVersion: { count: () => Promise.resolve(0) },
  };
  const prisma = {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;

  return {
    jobs: new JobService(prisma, {} as DiscoveryService),
    upsert,
  };
}

describe('origem da vaga salva', () => {
  it('sem origem, quem salvou foi você na tela', async () => {
    const { jobs, upsert } = service();

    const saved = await jobs.save({
      profileId: 'perfil',
      result: RESULT,
    } as Parameters<JobService['save']>[0]);

    expect(upsert.mock.calls[0][0].create.origin).toBe('tela');
    expect(saved.origin).toBe('tela');
  });

  it('o agente diário se identifica, para a vaga entrar na Seleção do agente', async () => {
    const { jobs, upsert } = service();

    const saved = await jobs.save({
      profileId: 'perfil',
      result: RESULT,
      origin: 'agente',
    });

    expect(upsert.mock.calls[0][0].create.origin).toBe('agente');
    // Salvar não cria análise: a vaga do agente chega sem veredito.
    expect(saved.fit).toBeNull();
  });
});
