import {
  IsString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryOptionsDto {
  @IsObject()
  @IsOptional()
  sort?: Record<string, 1 | -1>;

  @IsObject()
  @IsOptional()
  projection?: Record<string, 1 | 0>;
}

export class ExecuteQueryDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  options?: QueryOptionsDto;
}
