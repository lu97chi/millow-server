import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsOptional()
  role?: 'user' | 'system' | 'assistant' = 'user';
} 