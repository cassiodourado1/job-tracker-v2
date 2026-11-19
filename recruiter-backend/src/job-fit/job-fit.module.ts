import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { JobFitController } from './job-fit.controller';
import { JobFitService } from './job-fit.service';

@Module({
  // ProfileModule pelo ProfileExistsPipe da leitura da análise guardada.
  imports: [ProfileModule],
  controllers: [JobFitController],
  providers: [JobFitService],
})
export class JobFitModule {}
