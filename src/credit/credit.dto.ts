// credit.dto.ts
import { IsString, IsNumber, IsEnum, IsOptional, IsEmail } from 'class-validator';

export enum EmploymentStatus {
  FULL_TIME = 'full-time',
  PART_TIME = 'part-time',
  SELF_EMPLOYED = 'self-employed',
  UNEMPLOYED = 'unemployed',
}

export enum PropertyType {
  SINGLE_FAMILY = 'single-family',
  MULTI_FAMILY = 'multi-family',
  CONDO = 'condo',
  TOWNHOUSE = 'townhouse',
}

export class CreateCreditApplicationDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  phoneNumber: string;

  @IsEnum(EmploymentStatus)
  employmentStatus: string;

  @IsNumber()
  income: number;

  @IsNumber()
  creditScore: number;

  @IsNumber()
  @IsOptional()
  existingDebt?: number;

  @IsNumber()
  propertyValue: number;

  @IsNumber()
  loanAmount: number;

  @IsString()
  @IsOptional()
  propertyAddress?: string;

  @IsEnum(PropertyType)
  @IsOptional()
  propertyType?: string;
}

export class CreditEvaluationRequestDto {
  @IsString()
  sessionId: string;
}