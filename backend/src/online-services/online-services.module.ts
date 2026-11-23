import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnlineService } from './online-service.entity';
import { OnlineServicesService } from './online-services.service';
import { OnlineServicesController } from './online-services.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OnlineService])],
  providers: [OnlineServicesService],
  controllers: [OnlineServicesController],
  exports: [OnlineServicesService],
})
export class OnlineServicesModule {}