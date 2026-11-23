import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { jobFitRequestSchema } from '@recruit/shared';
import type { JobFitRequest, StoredJobFit } from '@recruit/shared';
import { ProfileExistsPipe } from '../common/pipes/profile-exists.pipe';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JobFitService } from './job-fit.service';

@Controller('job-fit')
export class JobFitController {
  constructor(private readonly jobFit: JobFitService) {}

  /** Análise sob demanda, por clique: cada uma é uma chamada paga. */
  @Post()
  analyze(
    @Body(new ZodValidationPipe(jobFitRequestSchema)) input: JobFitRequest,
  ): Promise<StoredJobFit> {
    return this.jobFit.analyze(input.profileId, input.jobId, input.origin);
  }

  /**
   * A última análise guardada, sem chamar o modelo. Embrulhada em `{ fit }`
   * porque o Nest responde `null` com corpo vazio, que não é JSON.
   */
  @Get()
  latest(
    @Query('profileId', ProfileExistsPipe) profileId: string,
    @Query('jobId') jobId: string,
  ): Promise<{ fit: StoredJobFit | null }> {
    return this.jobFit.latest(profileId, jobId ?? '').then((fit) => ({ fit }));
  }
}
