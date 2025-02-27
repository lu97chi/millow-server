import { IsString } from 'class-validator';

export class SearchPropertiesDto {
  @IsString()
  query: string;
} 