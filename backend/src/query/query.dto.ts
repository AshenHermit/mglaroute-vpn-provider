import { IsOptional, IsString, IsBoolean, IsArray, IsNumber, Min, Max, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryServersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @Transform(({ value }) => value === 'true')
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
  @IsIn(['latency_asc', 'latency_desc', 'confidence_desc', 'confidence_asc'])
  sort?: string = 'latency_asc';

  @IsOptional()
  @IsString()
  search?: string;
}