import { Module } from '@nestjs/common';
import { JobFitController } from './job-fit.controller';
import { JobFitService } from './job-fit.service';

@Module({
  controllers: [JobFitController],
  providers: [JobFitService],
})
export class JobFitModule {}
