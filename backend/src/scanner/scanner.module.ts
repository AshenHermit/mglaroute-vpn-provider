import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanHistory } from './scan-history.entity';
import { AnycastScore } from './anycast-scores.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ScanHistory, AnycastScore])],
  exports: [TypeOrmModule],
})
export class ScannerModule {}