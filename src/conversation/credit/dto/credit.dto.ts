import { 
  IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, ValidateNested, IsEmail, IsDate 
} from "class-validator";
import { Type } from 'class-transformer';

// Employment Status Enum
export enum EmploymentStatus {
  EMPLOYED = 'Empleado',
  SELF_EMPLOYED = 'Independiente',
  UNEMPLOYED = 'Desempleado',
  STUDENT = 'Estudiante',
  RETIRED = 'Retirado',
}

// Marital Status Enum
export enum MaritalStatus {
  SINGLE = 'Soltero',
  MARRIED = 'Casado',
  WIDOWED = 'Viudo',
  DIVORCED = 'Divorciado',
  SEPARATED = 'Separado',
}

// Debt details DTO
export class DebtDTO {
  @IsString()
  @IsNotEmpty()
  debt_type: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsNumber()
  @IsNotEmpty()
  monthly_payment: number;

  @IsNumber()
  @IsNotEmpty()
  interest_rate: number;
}

// Corrected CreditDTO
export class CreditDTO {
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @IsDate()
  @IsNotEmpty()
  @Type(() => Date)
  birthdate: Date;

  @IsString()
  @IsNotEmpty()
  nationality: string;

  @IsEnum(MaritalStatus)
  @IsOptional()
  marital_status?: MaritalStatus;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsNumber()
  @IsNotEmpty()
  income: number;

  @IsNumber()
  @IsNotEmpty()
  number_of_dependants: number;

  @IsNumber()
  @IsNotEmpty()
  credit_score: number;

  @IsEnum(EmploymentStatus)
  @IsNotEmpty()
  employmentStatus: EmploymentStatus;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @IsOptional()
  @IsString()
  curp?: string;

  @ValidateNested({ each: true })
  @IsOptional()
  @Type(() => DebtDTO)
  existing_debts?: DebtDTO[];
}

// ✅ Exported CreditQueryDto (missing DTO added here)
export class CreditQueryDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreditDTO)
  creditData?: CreditDTO;

  @IsString()
  @IsOptional()
  sessionId?: string;
}
