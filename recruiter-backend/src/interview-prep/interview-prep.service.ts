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
import {
  interviewPrepSchema,
  resumeSchema,
  type InterviewPrepLookup,
  type InterviewPrepRequest,
  type SavedInterviewPrep,
} from '@recruit/shared';
import { isResumeEmpty, renderResume } from '../answers/answer-plan';
import type { Env } from '../config/env';
import { jobHasSubstance, type FitJob } from '../job-fit/fit-plan';
import { PrismaService } from '../prisma/prisma.service';
import {
  finalizePrep,
  modelPrepSchema,
  PREP_SYSTEM,
  prepPrompt,
} from './prep-plan';

/**
 * Sonnet: o resultado é texto para você ler e falar, e o §4 manda escrita
 * para o Sonnet.
 */
const MODEL = 'claude-sonnet-5-5';

/** Chamada paga numa API sem autenticação: teto por minuto. */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

@Injectable()
export class InterviewPrepService {
  private readonly logger = new Logger(InterviewPrepService.name);
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

  /** Gera e guarda: é lida no dia da entrevista, e gerar de novo é pago. */
  async prepare(input: InterviewPrepRequest): Promise<SavedInterviewPrep> {
    if (!this.client) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'Preparação indisponível: defina ANTHROPIC_API_KEY no .env do backend.',
      });
    }

    const [resumeText, job] = await Promise.all([
      this.resumeOf(input.profileId),
      this.jobOf(input.jobId),
    ]);
    const context = input.context || null;

    this.assertWithinRateLimit();

    let message: Awaited<ReturnType<InterviewPrepService['ask']>>;

    try {
      message = await this.ask(resumeText, job, context);
    } catch (error) {
      this.failFromAnthropic(error);
    }

    if (message.stop_reason === 'refusal') {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'O modelo recusou preparar esta entrevista. Tente de novo.',
      });
    }

    if (!message.parsed_output) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'A preparação veio incompleta. Tente de novo.',
      });
    }

    const prep = finalizePrep(message.parsed_output, resumeText, context);

    const saved = await this.prisma.interviewPrep.create({
      data: {
        profileId: input.profileId,
        jobId: input.jobId,
        context,
        content: prep,
      },
      select: { id: true, createdAt: true },
    });

    return {
      id: saved.id,
      createdAt: saved.createdAt.toISOString(),
      context,
      prep,
    };
  }

  /** A preparação mais recente desta vaga, se houver. */
  async latest(profileId: string, jobId: string): Promise<InterviewPrepLookup> {
    const row = await this.prisma.interviewPrep.findFirst({
      where: { profileId, jobId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, context: true, content: true },
    });
    // Conteúdo gravado por uma versão anterior do formato vira "sem
    // preparação", não um 500: gerar de novo resolve.
    const prep = row ? interviewPrepSchema.safeParse(row.content) : null;

    if (!row || !prep?.success) {
      return { prep: null };
    }

    return {
      prep: {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        context: row.context,
        prep: prep.data,
      },
    };
  }

  /**
   * Regras e currículo no `system`, com o marcador de cache, como nas outras
   * chamadas: preparar a segunda vaga paga só a vaga. Saída estruturada
   * validada por Zod (§4).
   */
  private ask(resumeText: string, job: FitJob, context: string | null) {
    return this.client!.beta.messages.parse({
      model: MODEL,
      max_tokens: 16_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: betaZodOutputFormat(modelPrepSchema),
      },
      system: [
        { type: 'text', text: PREP_SYSTEM },
        {
          type: 'text',
          text: `<curriculo>\n${resumeText}\n</curriculo>`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: prepPrompt(job, context) }],
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
          'Preencha o currículo antes: a preparação parte das suas experiências.',
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
          'A vaga salva quase não tem descrição. Use "Extrair de um link" para trazer o texto completo da vaga antes de preparar.',
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
          message: 'Muitas preparações seguidas. Espere um minuto.',
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
        message: 'A preparação demorou demais. Tente de novo.',
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
      message: 'Não consegui preparar a entrevista agora. Tente de novo.',
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
