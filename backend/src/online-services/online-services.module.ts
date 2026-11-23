import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnlineService } from './online-service.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OnlineService])],
  exports: [TypeOrmModule],
})
export class OnlineServicesModule {}