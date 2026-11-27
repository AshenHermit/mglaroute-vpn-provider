import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from '../profiles/profile.entity';
import { AnycastScore } from '../scanner/anycast-scores.entity';
import { ScannerSettings } from '../settings/settings.entity';
import { OnlineServicesModule } from '../online-services/online-services.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Profile, AnycastScore, ScannerSettings]),
    OnlineServicesModule,
  ],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
