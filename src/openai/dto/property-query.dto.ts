/**
 * Property Query DTO
 * 
 * Changes:
 * - Created a new DTO for handling queries with property context
 */
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class PropertyQueryDto {
  @IsString()
  message: string;

  @IsString()
  propertyId: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;
} 