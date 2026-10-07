import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  createProfileSchema,
  importResumeSchema,
  updateProfileSchema,
} from '@recruit/shared';
import type {
  CreateProfileInput,
  ImportResumeInput,
  Profile,
  ProfileDetail,
  ResumeImportResult,
  UpdateProfileInput,
} from '@recruit/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ProfileService } from './profile.service';
import { ResumeImportService } from './resume-import/resume-import.service';

@Controller('profiles')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly resumeImport: ResumeImportService,
  ) {}

  @Get()
  list(): Promise<Profile[]> {
    return this.profileService.list();
  }

  @Get(':id')
  findDetailById(@Param('id') id: string): Promise<ProfileDetail> {
    return this.profileService.findDetailById(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProfileSchema))
    input: UpdateProfileInput,
  ): Promise<ProfileDetail> {
    return this.profileService.update(id, input);
  }

  /**
   * Texto de um currículo → currículo organizado, para revisão. NÃO grava: o
   * formulário mostra o resultado e quem salva é a pessoa. O nome do perfil é
   * o que permite tirar o nome do texto antes de ele ir ao modelo.
   */
  @Post(':id/resume/import')
  async importResume(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(importResumeSchema)) input: ImportResumeInput,
  ): Promise<ResumeImportResult> {
    const profile = await this.profileService.findDetailById(id);

    return this.resumeImport.import(input.text, profile.name);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createProfileSchema))
    input: CreateProfileInput,
  ): Promise<Profile> {
    return this.profileService.create(input);
  }
}
