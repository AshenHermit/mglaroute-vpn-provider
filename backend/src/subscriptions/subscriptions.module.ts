import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './subscription.entity';
import { Profile } from '../profiles/profile.entity';
import { ParserService } from '../scanner/parser.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, Profile])],
  providers: [SubscriptionsService, ParserService],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}