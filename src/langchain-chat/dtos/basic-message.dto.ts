import { IsString, IsOptional } from 'class-validator';
export class BasicMessageDto {
    @IsString()
    message: string;
  }
  