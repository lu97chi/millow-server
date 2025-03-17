/**
 * FindByLocation DTO
 *
 * Changes:
 * - Created separate file for FindByLocationDto
 * - Made location optional as it will only be available when calling from property-details endpoint
 * - Updated to support multiple place types
 * - Added support for location by region name (state/city) in addition to coordinates
 * - Added sorting and limit parameters for result filtering
 * - Moved SortByEnum to a shared file to avoid export conflicts
 * - Made either state OR city required if coordinates are not provided for better search results
 */
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  IsBoolean,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Coordinates } from '../interfaces/maps.interfaces';
import { SortByEnum } from './sort-options.enum';

export class FindByLocationDto {
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    // Handle both array and single string formats
    return Array.isArray(value) ? value : [value];
  })
  types: string[];

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(50000)
  radius?: number = 1000;

  @IsOptional()
  @IsString()
  userId?: string;

  @ValidateIf((o) => (!o.lat || !o.lng) && !o.city)
  @IsString()
  state?: string;

  @ValidateIf((o) => (!o.lat || !o.lng) && !o.state)
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(SortByEnum)
  @Transform(({ value }) => value?.toLowerCase())
  sortBy?: string = SortByEnum.RATING;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  sortDesc?: boolean = true;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(60)
  limit?: number = 20;
}
