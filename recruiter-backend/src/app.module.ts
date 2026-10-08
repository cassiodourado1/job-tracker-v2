import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AnswersModule } from './answers/answers.module';
import { AppService } from './app.service';
import { ApplicationModule } from './application/application.module';
import { EmailModule } from './email/email.module';
import { JobModule } from './job/job.module';
import { JobFitModule } from './job-fit/job-fit.module';
import { FormFillModule } from './form-fill/form-fill.module';
import { MetricsModule } from './metrics/metrics.module';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { TodayModule } from './today/today.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    ProfileModule,
    ApplicationModule,
    JobModule,
    JobFitModule,
    EmailModule,
    MetricsModule,
    FormFillModule,
    AnswersModule,
    TodayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
