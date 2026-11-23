import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanHistory } from './scan-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ScanHistory])],
  exports: [TypeOrmModule],
})
export class ScannerModule {}