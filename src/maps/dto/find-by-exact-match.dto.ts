/**
 * FindByExactMatch DTO
 *
 * Changes:
 * - Created separate file for FindByExactMatchDto
 * - Made location optional as it will only be available when calling from property-details endpoint
 * - Added state, city, and userId properties for improved location resolution
 * - Added sorting and limit parameters for result filtering
 * - Moved SortByEnum to a shared file to avoid export conflicts
 * - Made either state OR city required if coordinates are not provided for better search results
 */
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CoordinatesDto } from './coordinates.dto';
import { SortByEnum } from './sort-options.enum';

export class FindByExactMatchDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @Type(() => CoordinatesDto)
  location?: CoordinatesDto;

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

  @ValidateIf((o) => (!o.lat || !o.lng) && !o.city)
  @IsString()
  state?: string;

  @ValidateIf((o) => (!o.lat || !o.lng) && !o.state)
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  userId?: string;

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

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(60)
  limit?: number = 20;
}
