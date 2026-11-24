import { IsOptional, IsString, IsBoolean, IsArray, IsNumber, Min, Max, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { toBoolean } from '../../common/transforms/to-boolean';

export class FeedQueryDto {
  @IsOptional()
  @IsIn(['subscription', 'json'])
  format?: string = 'subscription';

  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  anycast?: boolean;

  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  reachable?: boolean;

  @IsOptional()
  @IsString()
  protocol?: string;

  @IsOptional()
  @IsString()
  search?: string;

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
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) return value.map(String);
    return String(value).split(',').filter(Boolean);
  })
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number = 200;
}
