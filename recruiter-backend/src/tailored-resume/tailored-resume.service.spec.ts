import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import { TailoredResumeService } from './tailored-resume.service';

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
    resumeVersion: { create, findFirst },
  } as unknown as PrismaService;
}

const RESPOSTA = {
  stop_reason: 'end_turn',
  parsed_output: {
    summary: 'Front-end com TypeScript e Vue.',
    experiences: [{ index: 0, description: 'Dashboards em Vue.' }],
    skills: ['TypeScript', 'Vue'],
    facts: [],
    gaps: ['Testes'],
  },
};

describe('TailoredResumeService', () => {
  beforeEach(() => {
    parse.mockReset();
    create.mockReset();
    findFirst.mockReset();
  });

  it('usa o Sonnet com cache e fallback, e devolve a proposta sem gravar', async () => {
    parse.mockResolvedValue(RESPOSTA);

    const result = await new TailoredResumeService(
      prisma(),
      config('chave'),
    ).tailor('perfil', 'vaga');

    const [[request]] = parse.mock.calls as [[Record<string, unknown>]];

    expect(request).toMatchObject({
      model: 'claude-sonnet-5-5',
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    });
    expect(JSON.stringify(request.system)).toContain('ephemeral');
    expect(JSON.stringify(request.messages)).toContain('<vaga>');
    expect(result.resume.skills).toEqual(['TypeScript', 'Vue']);
    expect(result.gaps).toEqual(['Testes']);
    expect(create).not.toHaveBeenCalled();
  });

  it('sem chave, diz o que configurar e não chama nada', async () => {
    await expect(
      new TailoredResumeService(prisma(), config(undefined)).tailor(
        'perfil',
        'vaga',
      ),
    ).rejects.toThrow('ANTHROPIC_API_KEY');
    expect(parse).not.toHaveBeenCalled();
  });

  it('vaga sem descrição pede o texto completo antes', async () => {
    await expect(
      new TailoredResumeService(
        prisma(RESUME, { ...JOB, requirements: [], description: 'Vaga.' }),
        config('chave'),
      ).tailor('perfil', 'vaga'),
    ).rejects.toThrow('quase não tem descrição');
    expect(parse).not.toHaveBeenCalled();
  });

  it('salva como versão da vaga, com rótulo que diz para qual', async () => {
    create.mockResolvedValue({
      id: 'versao',
      label: 'Adaptado para Front-end Sênior — Empresa Exemplo',
      createdAt: new Date('2026-10-13T12:00:00Z'),
    });

    const saved = await new TailoredResumeService(
      prisma(),
      config(undefined),
    ).save({ profileId: 'perfil', jobId: 'vaga', resume: RESUME });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          profileId: 'perfil',
          jobId: 'vaga',
          label: 'Adaptado para Front-end Sênior — Empresa Exemplo',
          content: RESUME,
        },
      }),
    );
    expect(saved.createdAt).toBe('2026-10-13T12:00:00.000Z');
  });

  it('sem versão salva, imprimir responde 404', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      new TailoredResumeService(prisma(), config(undefined)).latestContent(
        'perfil',
        'vaga',
      ),
    ).rejects.toThrow('Nenhum currículo adaptado');
  });
});
