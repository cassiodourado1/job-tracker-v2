import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { PrismaService } from '../prisma/prisma.service';
import { JobFitService } from './job-fit.service';

const parse = jest.fn();

// `@nestjs/config` e o SDK são ESM, e o Jest do projeto não os carrega; o
// PrismaService puxaria o cliente gerado do banco. O serviço recebe os dois
// prontos pelo construtor, então basta o módulo existir.
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
  summary: 'Front-end com React.',
  experiences: [
    {
      company: 'Empresa Antiga',
      role: 'Desenvolvedora Front-end',
      location: null,
      startDate: '2019-01',
      endDate: null,
      current: true,
      description: 'Dashboards em React com Highcharts.',
    },
  ],
  education: [],
  skills: ['React', 'TypeScript'],
  projects: [],
  languages: [],
  certifications: [],
};

const JOB = {
  company: 'Empresa Exemplo',
  title: 'Front-end Sênior',
  seniority: 'senior',
  stack: ['React'],
  requirements: ['React avançado', 'TypeScript', 'Testes'],
  description: 'Liderar o front-end.',
};

function prisma(resume: unknown = RESUME, job: unknown = JOB): PrismaService {
  return {
    profile: { findUnique: () => Promise.resolve({ resume }) },
    job: { findUnique: () => Promise.resolve(job) },
  } as unknown as PrismaService;
}

const RESPOSTA = {
  stop_reason: 'end_turn',
  parsed_output: {
    verdict: 'boa',
    summary: 'Cobre o obrigatório.',
    strengths: [
      { requirement: 'React', evidence: 'Dashboards em React com Highcharts' },
    ],
    gaps: [
      {
        requirement: 'Testes',
        severity: 'importante',
        howToAddress: 'Estudar.',
      },
    ],
  },
};

describe('JobFitService', () => {
  beforeEach(() => parse.mockReset());

  it('manda currículo e vaga, com cache e fallback, e confere o trecho', async () => {
    parse.mockResolvedValue(RESPOSTA);

    const fit = await new JobFitService(prisma(), config('chave')).analyze(
      'perfil',
      'vaga',
    );

    const [[request]] = parse.mock.calls as [[Record<string, unknown>]];

    expect(request).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
      output_config: { effort: 'medium' },
    });
    expect(JSON.stringify(request.system)).toContain('ephemeral');
    expect(JSON.stringify(request.messages)).toContain('<vaga>');
    expect(fit.verdict).toBe('boa');
    expect(fit.strengths[0].verified).toBe(true);
  });

  it('sem chave, diz o que configurar e não chama nada', async () => {
    await expect(
      new JobFitService(prisma(), config(undefined)).analyze('perfil', 'vaga'),
    ).rejects.toThrow('ANTHROPIC_API_KEY');
    expect(parse).not.toHaveBeenCalled();
  });

  it('currículo vazio pede para preencher antes, sem gastar chamada', async () => {
    await expect(
      new JobFitService(
        prisma({ ...RESUME, summary: null, experiences: [], skills: [] }),
        config('chave'),
      ).analyze('perfil', 'vaga'),
    ).rejects.toThrow('Preencha o currículo');
    expect(parse).not.toHaveBeenCalled();
  });

  it('vaga sem descrição pede o texto completo antes', async () => {
    await expect(
      new JobFitService(
        prisma(RESUME, { ...JOB, requirements: [], description: 'Vaga.' }),
        config('chave'),
      ).analyze('perfil', 'vaga'),
    ).rejects.toThrow('quase não tem descrição');
    expect(parse).not.toHaveBeenCalled();
  });

  it('recusa do modelo vira mensagem clara', async () => {
    parse.mockResolvedValue({ stop_reason: 'refusal', parsed_output: null });

    await expect(
      new JobFitService(prisma(), config('chave')).analyze('perfil', 'vaga'),
    ).rejects.toThrow('recusou');
  });
});
