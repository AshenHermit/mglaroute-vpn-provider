import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from '../profiles/profile.entity';
import { AnycastScore } from '../scanner/anycast-scores.entity';
import { ScannerSettings } from '../settings/settings.entity';
import { QueryService } from './query.service';
import { QueryController } from './query.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Profile, AnycastScore, ScannerSettings])],
  controllers: [QueryController],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}