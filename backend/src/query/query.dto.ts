import { IsOptional, IsString, IsBoolean, IsArray, IsNumber, Min, Max, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { toBoolean } from '../common/transforms/to-boolean';

export class QueryServersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  anycast?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsIn([
    'latency_asc', 'latency_desc',
    'confidence_asc', 'confidence_desc',
    'name_asc', 'name_desc',
    'address_asc', 'address_desc',
    'port_asc', 'port_desc',
    'protocol_asc', 'protocol_desc',
  ])
  sort?: string = 'latency_asc';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  protocol?: string;

  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  reachable?: boolean;
}