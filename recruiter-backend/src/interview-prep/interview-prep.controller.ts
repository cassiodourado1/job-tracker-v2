import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  interviewPrepLookupRequestSchema,
  interviewPrepRequestSchema,
} from '@recruit/shared';
import type {
  InterviewPrepLookup,
  InterviewPrepLookupRequest,
  InterviewPrepRequest,
  SavedInterviewPrep,
} from '@recruit/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InterviewPrepService } from './interview-prep.service';

@Controller('interview-prep')
export class InterviewPrepController {
  constructor(private readonly interviewPrep: InterviewPrepService) {}

  /** Sob demanda, por clique: cada preparação é uma chamada paga. */
  @Post()
  prepare(
    @Body(new ZodValidationPipe(interviewPrepRequestSchema))
    input: InterviewPrepRequest,
  ): Promise<SavedInterviewPrep> {
    return this.interviewPrep.prepare(input);
  }

  @Get()
  latest(
    @Query(new ZodValidationPipe(interviewPrepLookupRequestSchema))
    query: InterviewPrepLookupRequest,
  ): Promise<InterviewPrepLookup> {
    return this.interviewPrep.latest(query.profileId, query.jobId);
  }
}
