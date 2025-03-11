import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class QueryDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}
