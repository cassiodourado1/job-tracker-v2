import { Module } from '@nestjs/common';
import { TailoredResumeController } from './tailored-resume.controller';
import { TailoredResumeService } from './tailored-resume.service';

@Module({
  controllers: [TailoredResumeController],
  providers: [TailoredResumeService],
})
export class TailoredResumeModule {}
