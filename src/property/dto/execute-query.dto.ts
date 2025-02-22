import { IsString, IsNotEmpty, IsObject, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  pageSize?: number = 10;
}

export class QueryOptionsDto {
  @IsObject()
  @IsOptional()
  sort?: Record<string, 1 | -1>;

  @IsObject()
  @IsOptional()
  projection?: Record<string, 1 | 0>;
}

export class ExecuteQueryDto extends PaginationDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  options?: QueryOptionsDto;
} 