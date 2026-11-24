import { IsString, IsUrl, IsOptional, IsEnum, IsBoolean, IsInt, Min } from 'class-validator';
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

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 60, description: 'Minutes between automatic re-fetches; 0 disables per-subscription auto-update' })
  @IsOptional()
  @IsInt()
  @Min(0)
  autoUpdateIntervalMinutes?: number;
}