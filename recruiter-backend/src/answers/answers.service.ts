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
import { resumeSchema } from '@recruit/shared';
import type {
  AnswerDraft,
  AnswerLanguage,
  AnswerMode,
  CareerHistory,
} from '@recruit/shared';
import {
  historySystemBlocks,
  loadCareerHistory,
} from '../career-history/history-context';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import {
  ANSWER_SYSTEM,
  answerPrompt,
  finalize,
  isResumeEmpty,
  modelAnswerSchema,
  renderResume,
  type JobContext,
} from './answer-plan';

/**
 * Sonnet, e não Haiku: é escrita, e a seção 4 reserva Sonnet/Opus para isso.
 * A versão atual da linha.
 */
const MODEL = 'claude-sonnet-5-5';

/**
 * Cada rascunho é uma chamada paga, e a API não tem autenticação — escuta só
 * em 127.0.0.1, mas um laço acidental no próprio navegador ainda geraria
 * fatura. Dez por minuto é mais do que alguém escreve à mão.
 */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export interface DraftRequest {
  profileId: string;
  jobId?: string;
  jobText?: string;
  question: string;
  notes?: string;
  maxChars?: number;
  language: AnswerLanguage;
  mode: AnswerMode;
}

@Injectable()
export class AnswersService {
  private readonly logger = new Logger(AnswersService.name);
  private readonly client: Anthropic | null;
  private calls: number[] = [];

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const apiKey = config.get('ANTHROPIC_API_KEY', { infer: true });

    this.client = apiKey
      ? new Anthropic({
          apiKey,
          // Tem uma tela esperando. Mais que isto é requisição pendurada.
          timeout: 90_000,
          maxRetries: 1,
        })
      : null;
  }

  async draft(input: DraftRequest): Promise<AnswerDraft> {
    if (!this.client) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'Respostas por IA indisponíveis: defina ANTHROPIC_API_KEY no .env do backend.',
      });
    }

    const [resumeText, job, history] = await Promise.all([
      this.resumeOf(input.profileId),
      this.jobContext(input),
      loadCareerHistory(this.prisma, input.profileId),
    ]);

    this.assertWithinRateLimit();

    const notes = input.notes?.trim() || null;
    const maxChars = input.maxChars ?? null;
    let message: Awaited<ReturnType<typeof this.ask>>;

    try {
      message = await this.ask(
        resumeText,
        history,
        job,
        input,
        notes,
        maxChars,
      );
    } catch (error) {
      this.failFromAnthropic(error);
    }

    // Recusa não é erro de rede: a API respondeu que não vai responder. Os
    // `fallbacks` já tentaram outro modelo antes de chegar aqui.
    if (message.stop_reason === 'refusal') {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'A IA não quis responder a esta pergunta. Reformule a pergunta ou escreva a resposta à mão.',
      });
    }

    const output = message.parsed_output;
    const parsed = modelAnswerSchema.safeParse(output);

    if (!parsed.success) {
      this.logger.warn(
        `Resposta fora do formato para o perfil ${input.profileId} (stop: ${message.stop_reason})`,
      );

      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: 'A IA devolveu uma resposta incompleta. Tente de novo.',
      });
    }

    // Só uso e ids no log: pergunta, vaga e currículo são conteúdo seu.
    this.logger.log(
      `Rascunho (${input.mode}) para o perfil ${input.profileId}: ${message.usage.input_tokens} entrada, ${message.usage.cache_read_input_tokens ?? 0} do cache, ${message.usage.output_tokens} saída`,
    );

    return finalize(parsed.data, {
      mode: input.mode,
      maxChars,
      resumeText,
      notes,
      question: input.question,
      jobText: job.text,
      history,
    });
  }

  /**
   * A chamada.
   *
   * O currículo vai no `system`, depois das regras, com o marcador de cache:
   * regras e currículo não mudam entre perguntas, então a segunda pergunta
   * paga só a vaga e a pergunta. Tudo que varia vai na mensagem do usuário,
   * depois do prefixo.
   *
   * Saída estruturada validada por Zod — o modelo não devolve texto solto que
   * o código precise interpretar (seção 4). `fallbacks: "default"` refaz a
   * chamada em outro modelo se a primeira for recusada por engano.
   */
  private ask(
    resumeText: string,
    history: CareerHistory,
    job: JobContext,
    input: DraftRequest,
    notes: string | null,
    maxChars: number | null,
  ) {
    return this.client!.beta.messages.parse({
      model: MODEL,
      max_tokens: 8_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        // Escrita curta sobre fatos dados: `medium` basta, e é mais rápido.
        effort: 'medium',
        format: betaZodOutputFormat(modelAnswerSchema),
      },
      system: [
        { type: 'text', text: ANSWER_SYSTEM },
        {
          type: 'text',
          text: `<curriculo>\n${resumeText}\n</curriculo>`,
          cache_control: { type: 'ephemeral' },
        },
        ...historySystemBlocks(history),
      ],
      messages: [
        {
          role: 'user',
          content: answerPrompt({
            job,
            question: input.question,
            notes,
            maxChars,
            language: input.language,
            mode: input.mode,
          }),
        },
      ],
    });
  }

  /** O currículo do perfil, já validado e renderizado, ou 400 se vazio. */
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
          'Preencha o currículo antes: a resposta é montada a partir das suas experiências, e sem elas a IA só teria o que inventar.',
      });
    }

    return renderResume(resume.data);
  }

  private async jobContext(input: DraftRequest): Promise<JobContext> {
    if (!input.jobId) {
      return { company: null, title: null, text: input.jobText ?? '' };
    }

    const job = await this.prisma.job.findUnique({
      where: { id: input.jobId },
      select: {
        company: true,
        title: true,
        description: true,
        requirements: true,
        stack: true,
        seniority: true,
      },
    });

    if (!job) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Vaga não encontrada',
      });
    }

    const text = [
      job.seniority ? `Senioridade: ${job.seniority}` : '',
      job.stack.length > 0 ? `Stack: ${job.stack.join(', ')}` : '',
      job.requirements.length > 0
        ? `Requisitos:\n${job.requirements.map((item) => `- ${item}`).join('\n')}`
        : '',
      job.description ?? '',
      // Texto colado junto com uma vaga salva: complementa, não substitui.
      input.jobText ?? '',
    ]
      .filter(Boolean)
      .join('\n\n');

    return { company: job.company, title: job.title, text };
  }

  private assertWithinRateLimit(): void {
    const now = Date.now();

    this.calls = this.calls.filter((at) => now - at < RATE_WINDOW_MS);

    if (this.calls.length >= RATE_LIMIT) {
      throw new HttpException(
        {
          error: 'Too Many Requests',
          message: 'Muitas respostas seguidas. Espere um minuto.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.calls.push(now);
  }

  /**
   * Erro do SDK vira mensagem que diz o que fazer. A mensagem crua da API
   * fica só no log, sem o corpo da requisição — ele carrega o seu currículo.
   */
  private failFromAnthropic(error: unknown): never {
    const status = error instanceof APIError ? String(error.status) : '-';

    this.logger.error(
      `Falha ao chamar a Anthropic [${status}]: ${error instanceof Error ? error.message.slice(0, 200) : 'erro'}`,
    );

    // Timeout antes de conexão: um é subclasse do outro.
    if (error instanceof APIConnectionTimeoutError) {
      throw new GatewayTimeoutException({
        error: 'Gateway Timeout',
        message: 'A IA demorou demais para responder. Tente de novo.',
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
      /credit balance/i.test(error.message)
    ) {
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message:
          'Sem crédito na conta da Anthropic. Adicione créditos em console.anthropic.com.',
      });
    }

    throw new ServiceUnavailableException({
      error: 'Service Unavailable',
      message: 'Não consegui gerar a resposta agora. Tente de novo.',
    });
  }
}
