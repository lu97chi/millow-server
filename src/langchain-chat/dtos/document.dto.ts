import { IsString, IsOptional } from 'class-validator';

export class DocumentDto {
  @IsString()
  content: string;
  
  @IsOptional()
  metadata?: Record<string, any>;
}