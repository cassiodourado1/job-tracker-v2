import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Application,
  CreateApplicationInput,
  FollowUpAction,
  Resume,
  UpdateApplicationInput,
} from '@recruit/shared';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalJobUrl } from '../job/discovery/canonical-url';
import { active } from './active';
import { nextFollowUpAfter } from './follow-up';
import { fingerprint, labelFor, snapshotOf } from './resume-snapshot';
import type { ApplicationModel, JobModel } from '../generated/prisma/models';

/** O que a API expõe da vaga. Menos que a tabela, de propósito. */
/** Só o rótulo: o conteúdo do snapshot tem rota própria, e é grande. */
const versionSelect = { id: true, label: true, createdAt: true } as const;

const jobSelect = {
  id: true,
  company: true,
  title: true,
  url: true,
  seniority: true,
  workModel: true,
  location: true,
} as const;

type ApplicationRow = ApplicationModel & {
  job: Pick<JobModel, keyof typeof jobSelect>;
  resumeVersion: { id: string; label: string; createdAt: Date } | null;
};

/**
 * De onde veio uma mudança de status que não foi clique na tela.
 *
 * Parâmetro de código, e não campo do corpo HTTP: o `updateApplicationSchema`
 * continua sem `source`, então nenhum cliente consegue gravar um evento se
 * passando por confirmação de sugestão.
 */
export interface StatusOrigin {
  source: 'ia';
  emailMessageId: string;
  /** Quando a empresa respondeu — o email —, não quando você confirmou. */
  occurredAt: Date;
}

@Injectable()
export class ApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(profileId: string): Promise<Application[]> {
    const rows = await this.prisma.application.findMany({
      where: { profileId, ...active },
      orderBy: { updatedAt: 'desc' },
      include: {
        job: { select: jobSelect },
        resumeVersion: { select: versionSelect },
      },
    });

    return rows.map(toApplicationDto);
  }

  async findById(id: string): Promise<Application> {
    const row = await this.prisma.application.findFirst({
      where: { id, ...active },
      include: {
        job: { select: jobSelect },
        resumeVersion: { select: versionSelect },
      },
    });

    if (!row) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Candidatura não encontrada',
      });
    }

    return toApplicationDto(row);
  }

  /**
   * Vaga, candidatura e o primeiro StatusEvent numa transação só: ou os três
   * existem, ou nenhum. Uma candidatura sem evento inicial já nasceria com o
   * histórico furado, e as métricas dependem dele.
   */
  async create(input: CreateApplicationInput): Promise<Application> {
    const status = input.status ?? 'rascunho';

    const row = await this.prisma.$transaction(async (tx) => {
      // O profileId vem do body, e o ZodValidationPipe só garante o formato.
      // Sem esta checagem a violação de chave estrangeira viraria um 500 sem
      // explicação. Dentro da transação porque só assim é de fato atômico com
      // o insert — conferir antes deixaria uma janela entre checar e gravar.
      const profile = await tx.profile.findUnique({
        where: { id: input.profileId },
        select: { id: true, resume: true },
      });

      if (!profile) {
        throw new NotFoundException({
          error: 'Not Found',
          message: 'Perfil não encontrado',
        });
      }

      // Dois caminhos, garantidos pelo schema: ou vem `jobId` (aplicar a uma
      // vaga salva), ou vêm empresa e cargo (registrar do zero).
      let job: { id: string };

      if (input.jobId) {
        const saved = await tx.job.findUnique({
          where: { id: input.jobId },
          select: { id: true },
        });

        if (!saved) {
          throw new NotFoundException({
            error: 'Not Found',
            message: 'Vaga não encontrada',
          });
        }

        job = saved;
      } else {
        // Mesma URL é a mesma vaga: colar o link duas vezes não cria duplicata.
        //
        // Pela forma CANÔNICA, a mesma que a busca e o "Salvar" gravam. O link
        // colado costuma vir do navegador com enfeite — o nome da vaga depois
        // do id na InHire, o token de canal na Gupy, `?utm_source=` — e,
        // comparado cru, não achava a vaga salva: a candidatura ganhava uma
        // vaga nova, e a salva seguia como "sem candidatura".
        const url = input.url
          ? (canonicalJobUrl(input.url) ?? input.url)
          : null;
        const existingJob = url
          ? await tx.job.findUnique({ where: { url } })
          : null;

        job =
          existingJob ??
          (await tx.job.create({
            data: {
              company: input.company as string,
              title: input.title as string,
              url,
              source: 'manual',
            },
          }));
      }

      // Substitui o antigo @@unique([profileId, jobId]), que o soft delete
      // tornou inviável — ver o comentário no schema.prisma.
      const duplicate = await tx.application.findFirst({
        where: { profileId: input.profileId, jobId: job.id, ...active },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException({
          error: 'Conflict',
          message: 'Este perfil já tem uma candidatura ativa para esta vaga',
        });
      }

      const resumeVersionId = await freezeResume(
        tx,
        input.profileId,
        job.id,
        profile.resume,
      );

      const application = await tx.application.create({
        data: {
          profileId: input.profileId,
          jobId: job.id,
          status,
          notes: input.notes ?? null,
          appliedAt: input.appliedAt ? new Date(input.appliedAt) : null,
          resumeVersionId,
        },
        include: {
          job: { select: jobSelect },
          resumeVersion: { select: versionSelect },
        },
      });

      await tx.statusEvent.create({
        data: {
          applicationId: application.id,
          fromStatus: null,
          toStatus: status,
          source: 'manual',
          // Candidatura registrada com data de envio — a que vem do email de
          // confirmação, por exemplo — aconteceu NAQUELA data, não agora. É
          // exatamente o caso em que registro e fato mais se afastam.
          occurredAt: application.appliedAt ?? undefined,
        },
      });

      return application;
    });

    return toApplicationDto(row);
  }

  /**
   * Único lugar do código que altera `Application.status`. A mudança e o
   * StatusEvent saem na mesma transação — é o que sustenta a regra da seção 3
   * do CLAUDE.md ("nunca sobrescrever status sem gravar o evento") e o que faz
   * as métricas serem confiáveis depois.
   */
  async update(
    id: string,
    input: UpdateApplicationInput,
    origin?: StatusOrigin,
  ): Promise<Application> {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.application.findFirst({
        where: { id, ...active },
        select: { id: true, jobId: true, status: true },
      });

      if (!current) {
        throw new NotFoundException({
          error: 'Not Found',
          message: 'Candidatura não encontrada',
        });
      }

      const touchesJob =
        input.company !== undefined ||
        input.title !== undefined ||
        input.url !== undefined;

      if (touchesJob) {
        await tx.job.update({
          where: { id: current.jobId },
          data: {
            ...(input.company !== undefined && { company: input.company }),
            ...(input.title !== undefined && { title: input.title }),
            ...(input.url !== undefined && { url: input.url }),
          },
        });
      }

      const application = await tx.application.update({
        where: { id },
        data: {
          ...(input.status !== undefined && { status: input.status }),
          // Status novo, relógio novo: o lembrete volta a valer pela regra
          // do status que acabou de começar.
          ...(input.status !== undefined &&
            input.status !== current.status && { nextFollowUpAt: null }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.appliedAt !== undefined && {
            appliedAt: input.appliedAt ? new Date(input.appliedAt) : null,
          }),
        },
        include: {
          job: { select: jobSelect },
          resumeVersion: { select: versionSelect },
        },
      });

      if (input.status !== undefined && input.status !== current.status) {
        await tx.statusEvent.create({
          data: {
            applicationId: id,
            fromStatus: current.status,
            toStatus: input.status,
            source: origin?.source ?? 'manual',
            emailMessageId: origin?.emailMessageId,
            occurredAt: origin?.occurredAt,
          },
        });
      }

      return application;
    });

    return toApplicationDto(row);
  }

  /** Registra que você agiu sobre o lembrete de follow-up desta candidatura. */
  async recordFollowUp(id: string, action: FollowUpAction): Promise<void> {
    const current = await this.prisma.application.findFirst({
      where: { id, ...active },
      select: { status: true },
    });

    if (!current) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Candidatura não encontrada',
      });
    }

    await this.prisma.application.update({
      where: { id },
      data: {
        nextFollowUpAt: nextFollowUpAfter(action, current.status, new Date()),
      },
    });
  }

  /** Soft delete: a linha fica, o negócio deixa de enxergá-la. */
  /**
   * Soft delete não dispara `ON DELETE SET NULL`, então o email ligado a esta
   * candidatura precisa ser solto à mão. Sem isso ele aponta para uma linha
   * invisível e some das duas telas: não aparece na candidatura, porque ela
   * foi excluída, nem na caixa de não vinculados, porque ainda tem vínculo.
   */
  /**
   * O currículo exatamente como foi enviado nesta candidatura.
   *
   * Rota própria porque o conteúdo é grande e a listagem não precisa dele —
   * o DTO da candidatura leva só o rótulo.
   */
  async resumeOf(id: string): Promise<Resume> {
    const row = await this.prisma.application.findFirst({
      where: { id, ...active },
      select: { resumeVersion: { select: { content: true } } },
    });

    if (!row) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Candidatura não encontrada',
      });
    }

    const resume = row.resumeVersion
      ? snapshotOf(row.resumeVersion.content)
      : null;

    if (!resume) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Esta candidatura não tem currículo congelado',
      });
    }

    return resume;
  }

  /**
   * Corrige QUANDO uma transição aconteceu.
   *
   * O clique na lista registra "agora" — e tem que continuar sendo um clique
   * só, que é o que mantém a troca de status abaixo dos 30 segundos do §1.
   * Pedir data ali seria atrito na ação mais frequente do dia. Então a data
   * certa vem depois, quando você lembra que a entrevista foi marcada na
   * segunda e não na quarta em que registrou.
   *
   * Só `occurredAt` muda. `createdAt` continua dizendo quando o evento foi
   * gravado, e o status da candidatura não é tocado: corrigir a data de um
   * fato não altera o fato.
   */
  async setEventDate(
    applicationId: string,
    eventId: string,
    occurredAt: Date,
  ): Promise<void> {
    if (occurredAt.getTime() > Date.now()) {
      throw new BadRequestException({
        error: 'Bad Request',
        message: 'A data não pode estar no futuro.',
      });
    }

    // `updateMany` com a candidatura no filtro: o evento só é alcançável
    // através de uma candidatura ATIVA deste id. Um id de evento de outra
    // candidatura, ou de uma apagada, não encontra nada.
    const result = await this.prisma.statusEvent.updateMany({
      where: { id: eventId, application: { id: applicationId, ...active } },
      data: { occurredAt },
    });

    if (result.count === 0) {
      throw new NotFoundException({
        error: 'Not Found',
        message: 'Evento não encontrado',
      });
    }
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.application.updateMany({
        where: { id, ...active },
        data: { deletedAt: new Date() },
      });

      if (count === 0) {
        throw new NotFoundException({
          error: 'Not Found',
          message: 'Candidatura não encontrada',
        });
      }

      await tx.emailMessage.updateMany({
        where: { applicationId: id },
        data: { applicationId: null },
      });
    });
  }
}

function toApplicationDto(row: ApplicationRow): Application {
  return {
    id: row.id,
    profileId: row.profileId,
    status: row.status,
    notes: row.notes,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    job: {
      id: row.job.id,
      company: row.job.company,
      title: row.job.title,
      url: row.job.url,
      seniority: row.job.seniority,
      workModel: row.job.workModel,
      location: row.job.location,
    },
    resumeVersion: row.resumeVersion
      ? {
          id: row.resumeVersion.id,
          label: row.resumeVersion.label,
          createdAt: row.resumeVersion.createdAt.toISOString(),
        }
      : null,
  };
}

/**
 * Congela o currículo do momento e devolve a versão a vincular.
 *
 * Se você salvou um currículo adaptado para esta vaga, é ele que vai: foi o
 * que você preparou para mandar a ela.
 *
 * Reaproveita a última quando o conteúdo não mudou: sem isso seriam 30 linhas
 * idênticas depois de 30 candidaturas numa semana, e "qual versão eu mandei"
 * deixaria de ter resposta útil — teria 30 respostas iguais.
 *
 * Dentro da MESMA transação da candidatura. Fora dela, uma falha no insert da
 * candidatura deixaria uma versão órfã, e a `ResumeVersion` passaria a contar
 * uma história que não aconteceu.
 *
 * Sem currículo preenchido, devolve `null` e a candidatura fica sem versão —
 * é o estado honesto de quem ainda não escreveu o currículo.
 */
async function freezeResume(
  tx: Pick<PrismaService, 'resumeVersion'>,
  profileId: string,
  jobId: string,
  stored: unknown,
): Promise<string | null> {
  const tailored = await tx.resumeVersion.findFirst({
    where: { profileId, jobId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (tailored) {
    return tailored.id;
  }

  const resume = snapshotOf(stored);

  if (!resume) {
    return null;
  }

  // Só as versões base: uma adaptada nunca é igual ao currículo base, e
  // compará-la faria criar uma versão nova a cada candidatura.
  const latest = await tx.resumeVersion.findFirst({
    where: { profileId, jobId: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, content: true },
  });

  if (latest) {
    const previous = snapshotOf(latest.content);

    if (previous && fingerprint(previous) === fingerprint(resume)) {
      return latest.id;
    }
  }

  const created = await tx.resumeVersion.create({
    data: { profileId, label: labelFor(new Date()), content: resume },
    select: { id: true },
  });

  return created.id;
}
