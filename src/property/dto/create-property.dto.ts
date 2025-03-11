import {
  IsString,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  IsOptional,
  Min,
  IsNotEmpty,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PropertyTypeName,
  OperationType,
  PropertyEntityType,
  PropertyStatus,
  Amenity,
} from '../interfaces/property-filters.interface';

class CoordinatesDto {
  @IsNumber()
  @IsNotEmpty()
  lat: number;

  @IsNumber()
  @IsNotEmpty()
  lng: number;
}

class PropertyLocationDto {
  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates: CoordinatesDto;
}

class PropertyFeaturesDto {
  @IsNumber()
  @IsOptional()
  bedrooms?: number;

  @IsNumber()
  @IsOptional()
  bathrooms?: number;

  @IsNumber()
  @IsOptional()
  constructionSize?: number;

  @IsNumber()
  @IsOptional()
  lotSize?: number;

  @IsNumber()
  @IsOptional()
  parking?: number;

  @IsNumber()
  @IsOptional()
  floors?: number;
}

class AgentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty()
  company: string;

  @IsString()
  @IsNotEmpty()
  image: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNumber()
  @IsOptional()
  experience?: number;

  @IsNumber()
  @IsOptional()
  activeListings?: number;
}

export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum([
    'Desarrollos verticales',
    'Casas',
    'Locales Comerciales',
    'Oficinas',
    'Edificios',
    'Casas uso de suelo',
    'Bodegas comerciales',
    'Locales en centro comercial',
    'Departamentos',
    'Casas en condominio',
    'Desarrollos horizontales',
    'Naves industriales',
    'Terrenos comerciales',
    'Terrenos',
  ])
  propertyType: PropertyTypeName;

  @IsEnum(['Venta', 'Renta', 'Desarrollo'])
  operationType: OperationType;

  @IsEnum(['development', 'property'])
  type: PropertyEntityType;

  @IsNumber()
  @Min(0)
  price: number;

  @ValidateNested()
  @Type(() => PropertyLocationDto)
  location: PropertyLocationDto;

  @ValidateNested()
  @Type(() => PropertyFeaturesDto)
  features: PropertyFeaturesDto;

  @IsArray()
  @IsEnum(
    [
      'Alberca',
      'Circuito Cerrado',
      'Estacionamientos',
      'Gimnasio',
      'Jardín',
      'Roof Garden',
    ],
    { each: true },
  )
  amenities: Amenity[];

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  images: string[];

  @IsNumber()
  @IsOptional()
  propertyAge?: number;

  @IsNumber()
  @IsOptional()
  maintenanceFee?: number;

  @IsEnum(['available', 'sold', 'rented'])
  @IsOptional()
  status?: PropertyStatus;

  @ValidateNested()
  @Type(() => AgentDto)
  agent: AgentDto;
}
