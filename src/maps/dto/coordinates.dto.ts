/**
 * Coordinates DTO
 *
 * Changes:
 * - Created separate file for CoordinatesDto
 * - Made lat and lng optional as they will only be available when calling from property-details endpoint
 */
import { IsNumber, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { Coordinates } from '../interfaces/maps.interfaces';

export class CoordinatesDto implements Coordinates {
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  @Type(() => Number)
  lng?: number;
}
