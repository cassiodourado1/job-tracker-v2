import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { ResumeImportService } from './resume-import.service';

const create = jest.fn();

// `@nestjs/config` também é ESM; o serviço só o usa como tipo de injeção.
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

// O SDK é ESM, e o Jest do projeto não o carrega: o módulo inteiro é
// simulado, com classes de erro vazias só para os `instanceof` do serviço.
jest.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ messages: { create } })),
    APIError,
    APIConnectionError: class extends APIError {},
    APIConnectionTimeoutError: class extends APIError {},
    AuthenticationError: class extends APIError {},
    BadRequestError: class extends APIError {},
    RateLimitError: class extends APIError {},
  };
});

function config(apiKey: string | undefined): ConfigService<Env, true> {
  return {
    get: () => apiKey,
  } as unknown as ConfigService<Env, true>;
}

/** Currículo SINTÉTICO: pessoa e empresas inventadas. */
const TEXTO = `ANA CLARA BARREIRAS
Desenvolvedora Front-end Sênior
Barreiras, Bahia, Brasil
ana@exemplo.com.br | (77) 98888-1234 | linkedin.com/in/ana-barreiras

EXPERIÊNCIA
Empresa Exemplo — Desenvolvedora Front-end Sênior (2019 – atual)
Componentes em Vue e Nuxt, Design System e acessibilidade.`.padEnd(260, ' ');

const EXTRACAO = {
  headline: 'Desenvolvedora Front-end Sênior',
  location: 'Barreiras, Bahia',
  summary: null,
  experiences: [
    {
      company: 'Empresa Exemplo',
      role: 'Desenvolvedora Front-end Sênior',
      location: null,
      startDate: '2019-01',
      endDate: null,
      current: true,
      description: 'Componentes em Vue e Nuxt, Design System e acessibilidade.',
    },
  ],
  education: [],
  skills: ['Vue', 'Nuxt', 'Vue'],
  projects: [],
  languages: [],
  certifications: [],
};

function respostaComTool(input: unknown) {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'registrar_curriculo', input }],
  };
}

describe('ResumeImportService', () => {
  beforeEach(() => create.mockReset());

  it('manda ao modelo só o texto sem dados pessoais', async () => {
    create.mockResolvedValue(respostaComTool(EXTRACAO));

    await new ResumeImportService(config('chave')).import(
      TEXTO,
      'Ana Clara Barreiras',
    );

    const [[request]] = create.mock.calls as [[unknown]];
    const enviado = JSON.stringify(request);

    expect(enviado).not.toMatch(/ana clara barreiras/i);
    expect(enviado).not.toContain('ana@exemplo.com.br');
    expect(enviado).not.toContain('98888-1234');
    expect(enviado).not.toContain('linkedin.com/in');
    expect(enviado).toContain('Barreiras, Bahia, Brasil');
  });

  it('devolve o currículo para revisão, com os contatos tirados antes', async () => {
    create.mockResolvedValue(respostaComTool(EXTRACAO));

    const result = await new ResumeImportService(config('chave')).import(
      TEXTO,
      'Ana Clara Barreiras',
    );

    expect(result).toMatchObject({
      headline: 'Desenvolvedora Front-end Sênior',
      location: 'Barreiras, Bahia',
      email: 'ana@exemplo.com.br',
      phone: '(77) 98888-1234',
      links: {
        linkedin: 'https://linkedin.com/in/ana-barreiras',
        github: null,
        website: null,
      },
    });
    expect(result.resume.birthDate).toBeNull();
    expect(result.resume.experiences).toHaveLength(1);
    // Skill repetida pelo modelo sai uma vez só.
    expect(result.resume.skills).toEqual(['Vue', 'Nuxt']);
    expect(result.removed).toEqual(
      expect.arrayContaining<string>(['nome', 'email', 'telefone', 'LinkedIn']),
    );
  });

  it('resposta fora do formato vira erro claro, não currículo quebrado', async () => {
    create.mockResolvedValue(
      respostaComTool({ ...EXTRACAO, experiences: [{ company: '' }] }),
    );

    await expect(
      new ResumeImportService(config('chave')).import(TEXTO, 'Ana'),
    ).rejects.toThrow('A leitura do currículo veio incompleta');
  });

  it('currículo que estoura o limite de resposta avisa em vez de cortar', async () => {
    create.mockResolvedValue({ stop_reason: 'max_tokens', content: [] });

    await expect(
      new ResumeImportService(config('chave')).import(TEXTO, 'Ana'),
    ).rejects.toThrow('longo demais');
  });

  it('sem chave, diz o que configurar', async () => {
    await expect(
      new ResumeImportService(config(undefined)).import(TEXTO, 'Ana'),
    ).rejects.toThrow('ANTHROPIC_API_KEY');
    expect(create).not.toHaveBeenCalled();
  });
});
