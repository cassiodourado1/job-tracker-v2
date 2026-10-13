import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import { InterviewPrepService } from './interview-prep.service';

const parse = jest.fn();

// Mesmos mocks do job-fit: `@nestjs/config` e o SDK são ESM, e o
// PrismaService puxaria o cliente gerado do banco.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}

  return {
    __esModule: true,
    default: jest
      .fn()
      .mockImplementation(() => ({ beta: { messages: { parse } } })),
    APIError,
    APIConnectionError: class extends APIError {},
    APIConnectionTimeoutError: class extends APIError {},
    AuthenticationError: class extends APIError {},
    BadRequestError: class extends APIError {},
    RateLimitError: class extends APIError {},
  };
});
jest.mock('@anthropic-ai/sdk/helpers/beta/zod', () => ({
  betaZodOutputFormat: () => ({ type: 'json_schema' }),
}));

function config(apiKey: string | undefined): ConfigService<Env, true> {
  return { get: () => apiKey } as unknown as ConfigService<Env, true>;
}

/** Currículo e vaga SINTÉTICOS. */
const RESUME = {
  birthDate: null,
  summary: 'Front-end com Vue.',
  experiences: [
    {
      company: 'Empresa Antiga',
      role: 'Desenvolvedora Front-end',
      location: null,
      startDate: '2019-01',
      endDate: null,
      current: true,
      description: 'Dashboards em Vue com Highcharts.',
    },
  ],
  education: [],
  skills: ['Vue', 'TypeScript'],
  projects: [],
  languages: [],
  certifications: [],
};

const JOB = {
  company: 'Empresa Exemplo',
  title: 'Front-end Sênior',
  seniority: 'senior',
  stack: ['TypeScript'],
  requirements: ['TypeScript', 'Vue', 'Testes'],
  description: 'Liderar o front-end.',
};

const create = jest.fn();
const findFirst = jest.fn();

function prisma(resume: unknown = RESUME, job: unknown = JOB): PrismaService {
  return {
    profile: { findUnique: () => Promise.resolve({ resume }) },
    job: { findUnique: () => Promise.resolve(job) },
    interviewPrep: { create, findFirst },
  } as unknown as PrismaService;
}

const RESPOSTA = {
  stop_reason: 'end_turn',
  parsed_output: {
    questions: [
      {
        question: 'Como você estrutura um dashboard?',
        category: 'tecnica',
        why: 'A vaga fala em dados.',
        answerPoints: [
          {
            point: 'Dashboards em Vue',
            quote: 'Dashboards em Vue com Highcharts',
          },
        ],
      },
    ],
    toStudy: [{ topic: 'Testes', reason: 'A vaga pede.' }],
    questionsToAsk: ['Como é o time?'],
  },
};

describe('InterviewPrepService', () => {
  beforeEach(() => {
    parse.mockReset();
    create.mockReset();
    findFirst.mockReset();
  });

  it('gera com o Sonnet, com cache e fallback, e guarda', async () => {
    parse.mockResolvedValue(RESPOSTA);
    create.mockResolvedValue({
      id: 'prep',
      createdAt: new Date('2026-10-13T12:00:00Z'),
    });

    const saved = await new InterviewPrepService(
      prisma(),
      config('chave'),
    ).prepare({ profileId: 'perfil', jobId: 'vaga', context: 'Etapa técnica' });

    const [[request]] = parse.mock.calls as [[Record<string, unknown>]];

    expect(request).toMatchObject({
      model: 'claude-sonnet-5-5',
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    });
    expect(JSON.stringify(request.system)).toContain('ephemeral');
    expect(JSON.stringify(request.messages)).toContain('<etapa>');
    expect(saved.prep.questions[0].answerPoints[0].grounded).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileId: 'perfil',
          jobId: 'vaga',
          context: 'Etapa técnica',
        }) as unknown,
      }),
    );
  });

  it('sem chave, diz o que configurar e não chama nada', async () => {
    await expect(
      new InterviewPrepService(prisma(), config(undefined)).prepare({
        profileId: 'perfil',
        jobId: 'vaga',
      }),
    ).rejects.toThrow('ANTHROPIC_API_KEY');
    expect(parse).not.toHaveBeenCalled();
  });

  it('vaga sem descrição pede o texto completo antes', async () => {
    await expect(
      new InterviewPrepService(
        prisma(RESUME, { ...JOB, requirements: [], description: 'Vaga.' }),
        config('chave'),
      ).prepare({ profileId: 'perfil', jobId: 'vaga' }),
    ).rejects.toThrow('quase não tem descrição');
    expect(parse).not.toHaveBeenCalled();
  });

  it('preparação gravada num formato antigo volta como nenhuma', async () => {
    findFirst.mockResolvedValue({
      id: 'prep',
      createdAt: new Date(),
      context: null,
      content: { formato: 'antigo' },
    });

    await expect(
      new InterviewPrepService(prisma(), config(undefined)).latest(
        'perfil',
        'vaga',
      ),
    ).resolves.toEqual({ prep: null });
  });
});
