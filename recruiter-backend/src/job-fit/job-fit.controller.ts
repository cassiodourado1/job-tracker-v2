import { Body, Controller, Post } from '@nestjs/common';
import { jobFitRequestSchema } from '@recruit/shared';
import type { JobFit, JobFitRequest } from '@recruit/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JobFitService } from './job-fit.service';

@Controller('job-fit')
export class JobFitController {
  constructor(private readonly jobFit: JobFitService) {}

  /** Análise sob demanda, por clique: cada uma é uma chamada paga. */
  @Post()
  analyze(
    @Body(new ZodValidationPipe(jobFitRequestSchema)) input: JobFitRequest,
  ): Promise<JobFit> {
    return this.jobFit.analyze(input.profileId, input.jobId);
  }
}
