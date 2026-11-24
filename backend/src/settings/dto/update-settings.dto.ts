import { IsBoolean, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ default: 300 })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalSeconds?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  concurrency?: number;

  @ApiPropertyOptional({ default: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  timeoutMs?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  anycastMinSamples?: number;

  @ApiPropertyOptional({ default: 0.5 })
  @IsOptional()
  @IsNumber()
  anycastThreshold?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  latencyThresholdMs?: number;
}
