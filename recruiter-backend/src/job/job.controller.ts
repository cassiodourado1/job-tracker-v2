import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  discoverJobsSchema,
  dismissJobSchema,
  extractJobSchema,
  jobsDashboardQuerySchema,
  saveJobSchema,
  undismissJobSchema,
} from '@recruit/shared';
import type {
  DiscoverJobsQuery,
  DiscoverResult,
  DismissJobInput,
  ExtractJobInput,
  Job,
  JobsDashboard,
  JobsDashboardQuery,
  JobSearchResult,
  SaveJobInput,
  SavedJob,
  UndismissJobInput,
} from '@recruit/shared';
import { ProfileExistsPipe } from '../common/pipes/profile-exists.pipe';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JobExtractionService } from './job-extraction.service';
import { JobService } from './job.service';

@Controller('jobs')
export class JobController {
  constructor(
    private readonly jobService: JobService,
    private readonly extractionService: JobExtractionService,
  ) {}

  /**
   * Descoberta em lotes. Antes de `:id`, senão "discover" vira id de vaga.
   *
   * Dois pipes, e os dois são necessários: o Zod valida a forma da query, e o
   * ProfileExistsPipe confere o `profileId` contra o banco — ele chega do
   * cliente, e o §5 diz para tratá-lo como suspeito.
   */
  @Get('discover')
  discover(
    @Query(new ZodValidationPipe(discoverJobsSchema)) query: DiscoverJobsQuery,
    @Query('profileId', ProfileExistsPipe) profileId: string,
  ): Promise<DiscoverResult> {
    return this.jobService.discover({ ...query, profileId });
  }

  /** Painel do mercado. Também antes de `:id`, pelo mesmo motivo. */
  @Get('dashboard')
  dashboard(
    @Query(new ZodValidationPipe(jobsDashboardQuerySchema))
    query: JobsDashboardQuery,
    @Query('profileId', ProfileExistsPipe) profileId: string,
  ): Promise<JobsDashboard> {
    return this.jobService.dashboard(profileId, query.window);
  }

  /**
   * Extrai uma vaga a partir da URL. Não persiste nada: devolve o mesmo
   * formato de um resultado de busca, para revisão antes de salvar.
   */
  @Post('extract')
  extract(
    @Body(new ZodValidationPipe(extractJobSchema)) input: ExtractJobInput,
  ): Promise<JobSearchResult> {
    return this.extractionService.extract(input.url);
  }

  /** Também antes de `:id`. Recusar não grava vaga: só a URL e o rótulo. */
  @Post('dismissed')
  @HttpCode(HttpStatus.NO_CONTENT)
  dismiss(
    @Body(new ZodValidationPipe(dismissJobSchema)) input: DismissJobInput,
  ): Promise<void> {
    return this.jobService.dismiss(input);
  }

  @Delete('dismissed')
  @HttpCode(HttpStatus.NO_CONTENT)
  undismiss(
    @Body(new ZodValidationPipe(undismissJobSchema)) input: UndismissJobInput,
  ): Promise<void> {
    return this.jobService.undismiss(input);
  }

  // Antes de `:id`, senão "saved" seria capturado como id de vaga.
  @Get('saved')
  listSaved(
    @Query('profileId', ProfileExistsPipe) profileId: string,
  ): Promise<SavedJob[]> {
    return this.jobService.listSaved(profileId);
  }

  @Post('saved')
  save(
    @Body(new ZodValidationPipe(saveJobSchema)) input: SaveJobInput,
  ): Promise<SavedJob> {
    return this.jobService.save(input);
  }

  @Delete('saved/:jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsave(
    @Param('jobId') jobId: string,
    @Query('profileId', ProfileExistsPipe) profileId: string,
  ): Promise<void> {
    return this.jobService.unsave(profileId, jobId);
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<Job> {
    return this.jobService.findById(id);
  }
}
