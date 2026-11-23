import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { PostgresConfigModule } from './common/postgres/postgres-config.module';
import { RedisModule } from './common/redis/redis.module';
import { HttpModule } from './common/http/http.module';

import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ProfilesModule } from './profiles/profiles.module';
import { OnlineServicesModule } from './online-services/online-services.module';
import { ScannerModule } from './scanner/scanner.module';
import { QueryModule } from './query/query.module';
import { HealthModule } from './health/health.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    PostgresConfigModule,
    RedisModule,
    HttpModule,
    AuthModule,
    SettingsModule,
    SubscriptionsModule,
    ProfilesModule,
    OnlineServicesModule,
    ScannerModule,
    QueryModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: EnvelopeInterceptor,
    },
  ],
})
export class AppModule {}