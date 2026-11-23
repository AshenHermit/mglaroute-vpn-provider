import { IsString, IsUrl, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '../subscription.entity';

export class CreateSubscriptionDto {
  @ApiProperty({ example: 'My VPN Subscription' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'https://example.com/subscription.txt' })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}