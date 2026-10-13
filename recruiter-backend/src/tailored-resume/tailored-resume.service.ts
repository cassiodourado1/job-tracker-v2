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
  resumeSchema,
  type Resume,
  type SaveTailoredResumeInput,
  type TailoredResume,
  type TailoredVersion,
  type TailoredVersionLookup,
} from '@recruit/shared';
import { isResumeEmpty, renderResume } from '../answers/answer-plan';
import type { Env } from '../config/env';
import { jobHasSubstance, type FitJob } from '../job-fit/fit-plan';
import { PrismaService } from '../prisma/prisma.service';
import {
  finalizeTailored,
  modelTailorSchema,
  TAILOR_SYSTEM,
  tailorPrompt,
} from './tailor-plan';

/**
 * Sonnet: é escrita, e o §4 manda escrita para o Sonnet. O julgamento do que
 * a vaga valoriza já é feito na análise de aderência, com o Opus.
 */
const MODEL = 'claude-sonnet-5-5';

/** Chamada paga numa API sem autenticação: teto por minuto. */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const versionSelect = { id: true, label: true, createdAt: true } as const;

@Injectable()
export class TailoredResumeService {
  private readonly logger = new Logger(TailoredResumeService.name);
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

  /** A proposta, para revisar. Nada é gravado aqui. */
  async tailor(profileId: string, jobId: string): Promise<TailoredResume> {
    if (!this.client) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'Adaptação indisponível: defina ANTHROPIC_API_KEY no .env do backend.',
      });
    }

    const [resume, job] = await Promise.all([
      this.resumeOf(profileId),
      this.jobOf(jobId),
    ]);

    if (!jobHasSubstance(job)) {
      throw new BadRequestException({
        error: 'Bad Request',
        message:
          'A vaga salva quase não tem descrição. Use "Extrair de um link" para trazer o texto completo da vaga antes de adaptar.',
      });
    }

    const resumeText = renderResume(resume);

    this.assertWithinRateLimit();

    let message: Awaited<ReturnType<TailoredResumeService['ask']>>;

    try {
      message = await this.ask(resumeText, resume, job);
    } catch (error) {
      this.failFromAnthropic(error);
    }

    if (message.stop_reason === 'refusal') {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'O modelo recusou adaptar o currículo. Tente de novo.',
      });
    }

    if (!message.parsed_output) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'A adaptação veio incompleta. Tente de novo.',
      });
    }

    return finalizeTailored(message.parsed_output, resume, resumeText);
  }

  /**
   * Grava o currículo revisado como versão desta vaga. A candidatura que você
   * registrar para ela depois leva esta versão; uma já registrada continua
   * com a que tinha, porque é o registro do que foi enviado.
   */
  async save(input: SaveTailoredResumeInput): Promise<TailoredVersion> {
    await this.resumeOf(input.profileId);

    const job = await this.jobOf(input.jobId);

    const version = await this.prisma.resumeVersion.create({
      data: {
        profileId: input.profileId,
        jobId: input.jobId,
        label: `Adaptado para ${job.title} — ${job.company}`.slice(0, 200),
        content: input.resume,
      },
      select: versionSelect,
    });

    return toDto(version);
  }

  /** A versão adaptada mais recente desta vaga, se houver. */
  async latest(
    profileId: string,
    jobId: string,
  ): Promise<TailoredVersionLookup> {
    const version = await this.prisma.resumeVersion.findFirst({
      where: { profileId, jobId },
      orderBy: { createdAt: 'desc' },
      select: versionSelect,
    });

    return { version: version ? toDto(version) : null };
  }

  /** O conteúdo da versão adaptada mais recente, para imprimir. */
  async latestContent(profileId: string, jobId: string): Promise<Resume> {
    const version = await this.prisma.resumeVersion.findFirst({
      where: { profileId, jobId },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });
    const resume = version ? resumeSchema.safeParse(version.content) : null;

    if (!resume?.success) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Nenhum currículo adaptado salvo para esta vaga',
      });
    }

    return resume.data;
  }

  /**
   * Regras e currículo no `system`, com o marcador de cache, como na análise
   * de aderência: adaptar para a segunda vaga paga só a vaga. Saída
   * estruturada validada por Zod (§4).
   */
  private ask(resumeText: string, resume: Resume, job: FitJob) {
    return this.client!.beta.messages.parse({
      model: MODEL,
      max_tokens: 16_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: betaZodOutputFormat(modelTailorSchema),
      },
      system: [
        { type: 'text', text: TAILOR_SYSTEM },
        {
          type: 'text',
          text: `<curriculo>\n${resumeText}\n</curriculo>`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: tailorPrompt(job, resume) }],
    });
  }

  private async resumeOf(profileId: string): Promise<Resume> {
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
          'Preencha o currículo antes: a adaptação parte das suas experiências.',
      });
    }

    return resume.data;
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

    return job;
  }

  private assertWithinRateLimit(): void {
    const now = Date.now();

    this.calls = this.calls.filter((at) => now - at < RATE_WINDOW_MS);

    if (this.calls.length >= RATE_LIMIT) {
      throw new HttpException(
        {
          error: 'Too Many Requests',
          message: 'Muitas adaptações seguidas. Espere um minuto.',
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
        message: 'A adaptação demorou demais. Tente de novo.',
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
      message: 'Não consegui adaptar o currículo agora. Tente de novo.',
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

function toDto(version: {
  id: string;
  label: string;
  createdAt: Date;
}): TailoredVersion {
  return {
    id: version.id,
    label: version.label,
    createdAt: version.createdAt.toISOString(),
  };
}
