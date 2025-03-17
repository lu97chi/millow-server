import { IsString, IsOptional } from 'class-validator';

export class ContextAwareDto {
  @IsString()
  message: string;
  
  @IsString()
  @IsOptional()
  conversationId?: string;
}