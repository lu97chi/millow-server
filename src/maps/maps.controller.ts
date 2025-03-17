/**
 * Maps Controller
 *
 * Changes:
 * - Created Maps controller for handling Google Maps API requests
 * - Implemented findByLocation endpoint to search for places by type (hospitals, parks, etc.)
 * - Implemented findByExactMatch endpoint to search for specific places by name
 * - Added validation for optional location parameters
 * - Updated to support searching for multiple place types
 * - Added support for location by region name (state/city) and userId
 * - Added support for sorting and limiting results
 * - Updated imports to use the DTO index file
 * - Updated to handle BadRequestException for missing required parameters
 */
import {
  Controller,
  Get,
  Query,
  Logger,
  HttpException,
  HttpStatus,
  ValidationPipe,
  UsePipes,
  BadRequestException,
} from '@nestjs/common';
import { MapsService } from './maps.service';
import { FindByLocationDto, FindByExactMatchDto } from './dto';
import { MapsResponse } from './interfaces/maps.interfaces';

@Controller('maps')
export class MapsController {
  private readonly logger = new Logger(MapsController.name);

  constructor(private readonly mapsService: MapsService) {}

  @Get('find-by-location')
  @UsePipes(new ValidationPipe({ transform: true }))
  async findByLocation(
    @Query() query: FindByLocationDto,
  ): Promise<MapsResponse> {
    try {
      this.logger.log(
        `Finding places by location: types=${query.types}, ` +
          `coordinates=${query.lat ? `${query.lat},${query.lng}` : 'not provided'}, ` +
          `state=${query.state || 'not provided'}, ` +
          `city=${query.city || 'not provided'}, ` +
          `userId=${query.userId || 'not provided'}, ` +
          `sortBy=${query.sortBy}, sortDesc=${query.sortDesc}, limit=${query.limit}`,
      );

      // Extract location coordinates if provided
      const location =
        query.lat && query.lng ? { lat: query.lat, lng: query.lng } : undefined;

      return await this.mapsService.findByLocation(
        query.types,
        location,
        query.radius,
        query.userId,
        query.state,
        query.city,
        query.sortBy,
        query.sortDesc,
        query.limit,
      );
    } catch (error) {
      this.logger.error(
        `Error in findByLocation: ${error.message}`,
        error.stack,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new HttpException(
        error.message || 'Failed to find places by location',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('find-by-exact-match')
  @UsePipes(new ValidationPipe({ transform: true }))
  async findByExactMatch(
    @Query() query: FindByExactMatchDto,
  ): Promise<MapsResponse> {
    try {
      this.logger.log(
        `Finding places by exact match: query=${query.query}, ` +
          `coordinates=${query.lat ? `${query.lat},${query.lng}` : 'not provided'}, ` +
          `state=${query.state || 'not provided'}, ` +
          `city=${query.city || 'not provided'}, ` +
          `userId=${query.userId || 'not provided'}, ` +
          `sortBy=${query.sortBy}, sortDesc=${query.sortDesc}, limit=${query.limit}`,
      );

      // Extract location coordinates if provided
      const location =
        query.lat && query.lng ? { lat: query.lat, lng: query.lng } : undefined;

      return await this.mapsService.findByExactMatch(
        query.query,
        location,
        query.userId,
        query.state,
        query.city,
        query.sortBy,
        query.sortDesc,
        query.limit,
      );
    } catch (error) {
      this.logger.error(
        `Error in findByExactMatch: ${error.message}`,
        error.stack,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new HttpException(
        error.message || 'Failed to find places by exact match',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
