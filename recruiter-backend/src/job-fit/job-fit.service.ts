import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resumeSchema, type JobFit } from '@recruit/shared';
import { isResumeEmpty, renderResume } from '../answers/answer-plan';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import {
  finalizeFit,
  FIT_SYSTEM,
  fitPrompt,
  jobHasSubstance,
  modelFitSchema,
  type FitJob,
} from './fit-plan';

/**
 * Opus: é julgamento (o que a vaga trata como obrigatório, o que é
 * contornável), não extração. Esforço explícito em `medium`, que é o padrão
 * deste modelo — escrito para não mudar sozinho numa troca de modelo.
 */
const MODEL = 'claude-opus-5-5';

/** Chamada paga numa API sem autenticação: teto por minuto. */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

@Injectable()
export class JobFitService {
  private readonly logger = new Logger(JobFitService.name);
  private readonly client: Anthropic | null;
  private calls: number[] = [];

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const apiKey = config.get('ANTHROPIC_API_KEY', { infer: true });

    this.client = apiKey
      ? new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 })
      : null;
  }

  async analyze(profileId: string, jobId: string): Promise<JobFit> {
    if (!this.client) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'Análise indisponível: defina ANTHROPIC_API_KEY no .env do backend.',
      });
    }

    const [resumeText, job] = await Promise.all([
      this.resumeOf(profileId),
      this.jobOf(jobId),
    ]);

    this.assertWithinRateLimit();

    let message: Awaited<ReturnType<JobFitService['ask']>>;

    try {
      message = await this.ask(resumeText, job);
    } catch (error) {
      this.failFromAnthropic(error);
    }

    if (message.stop_reason === 'refusal') {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'O modelo recusou analisar esta vaga. Tente de novo.',
      });
    }

    if (!message.parsed_output) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'A análise veio incompleta. Tente de novo.',
      });
    }

    return finalizeFit(message.parsed_output, resumeText);
  }

  /**
   * Regras e currículo no `system`, com o marcador de cache: não mudam entre
   * vagas, então analisar a segunda vaga paga só a vaga. Saída estruturada
   * validada por Zod (§4). `fallbacks: "default"` refaz a chamada em outro
   * modelo se a primeira for recusada por engano.
   */
  private ask(resumeText: string, job: FitJob) {
    return this.client!.beta.messages.parse({
      model: MODEL,
      max_tokens: 16_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: betaZodOutputFormat(modelFitSchema),
      },
      system: [
        { type: 'text', text: FIT_SYSTEM },
        {
          type: 'text',
          text: `<curriculo>\n${resumeText}\n</curriculo>`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: fitPrompt(job) }],
    });
  }

  /** O currículo do perfil, renderizado sem dados pessoais, ou 400 se vazio. */
  private async resumeOf(profileId: string): Promise<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { resume: true },
    });

    if (!profile) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Perfil não encontrado',
      });
    }

    const resume = resumeSchema.safeParse(profile.resume);

    if (!resume.success || isResumeEmpty(resume.data)) {
      throw new BadRequestException({
        error: 'Bad Request',
        message:
          'Preencha o currículo antes: a análise compara a vaga com as suas experiências.',
      });
    }

    return renderResume(resume.data);
  }

  private async jobOf(jobId: string): Promise<FitJob> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: {
        company: true,
        title: true,
        seniority: true,
        stack: true,
        requirements: true,
        description: true,
      },
    });

    if (!job) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Vaga não encontrada',
      });
    }

    if (!jobHasSubstance(job)) {
      throw new BadRequestException({
        error: 'Bad Request',
        message:
          'A vaga salva quase não tem descrição. Use "Extrair de um link" para trazer o texto completo da vaga antes de analisar.',
      });
    }

    return job;
  }

  private assertWithinRateLimit(): void {
    const now = Date.now();

    this.calls = this.calls.filter((at) => now - at < RATE_WINDOW_MS);

    if (this.calls.length >= RATE_LIMIT) {
      throw new HttpException(
        {
          error: 'Too Many Requests',
          message: 'Muitas análises seguidas. Espere um minuto.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.calls.push(now);
  }

  /** Cada causa vira o que fazer; a mensagem crua da API fica no log. */
  private failFromAnthropic(error: unknown): never {
    this.logger.error(`Falha ao chamar a Anthropic: ${apiMessage(error)}`);

    if (error instanceof APIConnectionTimeoutError) {
      throw new GatewayTimeoutException({
        error: 'Gateway Timeout',
        message: 'A análise demorou demais. Tente de novo.',
      });
    }

    if (error instanceof APIConnectionError) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'Não consegui falar com a API da Anthropic. Verifique a conexão.',
      });
    }

    if (error instanceof AuthenticationError) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'A API recusou a chave. Confira ANTHROPIC_API_KEY no .env do backend.',
      });
    }

    if (error instanceof RateLimitError) {
      throw new HttpException(
        {
          error: 'Too Many Requests',
          message: 'A Anthropic está limitando as chamadas. Espere um pouco.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (
      error instanceof BadRequestError &&
      /credit balance/i.test(apiMessage(error))
    ) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'Sem crédito na conta da Anthropic. Adicione créditos em console.anthropic.com.',
      });
    }

    throw new ServiceUnavailableException({
      error: 'Service Unavailable',
      message: 'Não consegui analisar a vaga agora. Tente de novo.',
    });
  }
}

function apiMessage(error: unknown): string {
  const body: unknown = error instanceof APIError ? error.error : undefined;

  if (typeof body === 'object' && body !== null && 'error' in body) {
    const detail: unknown = body.error;

    if (typeof detail === 'object' && detail !== null && 'message' in detail) {
      const text: unknown = detail.message;

      if (typeof text === 'string') {
        return text;
      }
    }
  }

  return error instanceof Error ? error.message : String(error);
}
