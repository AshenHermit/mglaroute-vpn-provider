import { IsString, IsArray, IsUrl, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOnlineServiceDto {
  @ApiProperty({ example: 'YouTube' })
  @IsString()
  name: string;

  @ApiProperty({ type: [String], example: ['https://www.youtube.com'] })
  @IsArray()
  @IsUrl({}, { each: true })
  testUrls: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean = true;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean = false;
}