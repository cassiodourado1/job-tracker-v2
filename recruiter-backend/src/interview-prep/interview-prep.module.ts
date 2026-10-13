import { Module } from '@nestjs/common';
import { InterviewPrepController } from './interview-prep.controller';
import { InterviewPrepService } from './interview-prep.service';

@Module({
  controllers: [InterviewPrepController],
  providers: [InterviewPrepService],
})
export class InterviewPrepModule {}
