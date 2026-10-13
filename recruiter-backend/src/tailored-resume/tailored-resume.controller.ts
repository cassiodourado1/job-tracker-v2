import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  saveTailoredResumeSchema,
  tailorResumeRequestSchema,
} from '@recruit/shared';
import type {
  Resume,
  SaveTailoredResumeInput,
  TailoredResume,
  TailoredVersion,
  TailoredVersionLookup,
  TailorResumeRequest,
} from '@recruit/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TailoredResumeService } from './tailored-resume.service';

@Controller('tailored-resume')
export class TailoredResumeController {
  constructor(private readonly tailored: TailoredResumeService) {}

  /** Proposta sob demanda, por clique: cada uma é uma chamada paga. */
  @Post()
  tailor(
    @Body(new ZodValidationPipe(tailorResumeRequestSchema))
    input: TailorResumeRequest,
  ): Promise<TailoredResume> {
    return this.tailored.tailor(input.profileId, input.jobId);
  }

  /** O currículo revisado. Revalidado aqui: a tela deixa editar a proposta. */
  @Post('save')
  save(
    @Body(new ZodValidationPipe(saveTailoredResumeSchema))
    input: SaveTailoredResumeInput,
  ): Promise<TailoredVersion> {
    return this.tailored.save(input);
  }

  @Get()
  latest(
    @Query(new ZodValidationPipe(tailorResumeRequestSchema))
    query: TailorResumeRequest,
  ): Promise<TailoredVersionLookup> {
    return this.tailored.latest(query.profileId, query.jobId);
  }

  @Get('content')
  latestContent(
    @Query(new ZodValidationPipe(tailorResumeRequestSchema))
    query: TailorResumeRequest,
  ): Promise<Resume> {
    return this.tailored.latestContent(query.profileId, query.jobId);
  }
}
