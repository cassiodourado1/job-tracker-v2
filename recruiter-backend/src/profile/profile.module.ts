import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ResumeImportService } from './resume-import/resume-import.service';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, ResumeImportService],
  exports: [ProfileService],
})
export class ProfileModule {}
