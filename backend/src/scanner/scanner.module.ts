import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanHistory } from './scan-history.entity';
import { AnycastScore } from './anycast-scores.entity';
import { ParserService } from './parser.service';
import { LatencyService } from './latency.service';
import { ReachabilityService } from './reachability.service';
import { AnycastService } from './anycast.service';
import { ScannerService } from './scanner.service';
import { CronService } from './cron.service';
import { ScannerController } from './scanner.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { SettingsModule } from '../settings/settings.module';
import { OnlineServicesModule } from '../online-services/online-services.module';
import { HttpModule } from '../common/http/http.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScanHistory, AnycastScore]),
    SubscriptionsModule,
    ProfilesModule,
    SettingsModule,
    OnlineServicesModule,
    HttpModule,
  ],
  controllers: [ScannerController],
  providers: [
    ParserService,
    LatencyService,
    ReachabilityService,
    AnycastService,
    ScannerService,
    CronService,
  ],
  exports: [ScannerService, ParserService],
})
export class ScannerModule {}