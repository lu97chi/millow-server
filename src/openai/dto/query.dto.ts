import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class QueryDto {
  @IsString()
  @IsNotEmpty({ message: 'Query cannot be empty' })
  @MaxLength(2000, { message: 'Query is too long, maximum length is 2000 characters' })
  query: string;
} 