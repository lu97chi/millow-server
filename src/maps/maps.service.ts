/**
 * Maps Service
 *
 * Changes:
 * - Created Maps service for handling Google Maps API requests
 * - Implemented findByLocation method to search for places by type (hospitals, parks, etc.)
 * - Implemented findByExactMatch method to search for specific places by name
 * - Updated to use interfaces from separate file
 * - Made lat/lng optional in the methods
 * - Fixed type issue with apiKey
 * - Fixed handling of missing location coordinates in findByLocation
 * - Added support for searching multiple place types in a single request
 * - Integrated with LocationResolverService to handle user location preferences
 * - Added sorting and limiting of results by rating, distance, or prominence
 * - Updated to require either coordinates, state, OR city for better search results
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  Coordinates,
  PlaceResult,
  MapsResponse,
} from './interfaces/maps.interfaces';
import { LocationResolverService } from './services/location-resolver.service';

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor(
    private configService: ConfigService,
    private locationResolver: LocationResolverService,
  ) {
    this.apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');

    if (!this.apiKey) {
      this.logger.warn(
        'Google Maps API key is not set. Maps functionality will be limited.',
      );
    }
  }

  /**
   * Find places by location types (e.g., hospitals, parks)
   * @param types Array of place types to search for (e.g., ['hospital', 'park'])
   * @param location The reference location coordinates (optional)
   * @param radius The search radius in meters (default: 1000)
   * @param userId Optional user ID to fetch user's default location
   * @param state State name to geocode (required if coordinates and city not provided)
   * @param city City name to geocode (required if coordinates and state not provided)
   * @param sortBy Field to sort results by (rating, distance, prominence)
   * @param sortDesc Whether to sort in descending order
   * @param limit Maximum number of results to return
   * @returns Promise with the search results
   */
  async findByLocation(
    types: string[],
    location?: Coordinates,
    radius: number = 1000,
    userId?: string,
    state?: string,
    city?: string,
    sortBy: string = 'rating',
    sortDesc: boolean = true,
    limit: number = 20,
  ): Promise<MapsResponse> {
    try {
      if (!this.apiKey) {
        return {
          results: [],
          status: 'ERROR',
          message: 'Google Maps API key is not configured',
        };
      }

      // Validate inputs
      if (!types || types.length === 0) {
        return {
          results: [],
          status: 'INVALID_REQUEST',
          message: 'Missing required parameter: types',
        };
      }

      // Validate that either coordinates, state, or city is provided
      if ((!location || !location.lat || !location.lng) && !state && !city) {
        throw new BadRequestException(
          'Either coordinates (lat/lng), state, or city must be provided for location-based search',
        );
      }

      // Resolve location based on provided parameters
      const { coordinates, isAccurate } =
        await this.locationResolver.resolveLocation(
          userId,
          state,
          city,
          location,
        );

      this.logger.log(
        `Using location coordinates: ${JSON.stringify(coordinates)}, accurate: ${isAccurate}`,
      );

      // For location-based search, we need to make separate requests for each type
      // and combine the results
      const allResults: PlaceResult[] = [];
      let overallStatus = 'OK';
      let errorMessage = '';

      // Process each type in parallel
      const searchPromises = types.map((type) =>
        this.findSingleTypeByLocation(type, coordinates, radius),
      );
      const responses = await Promise.all(searchPromises);

      // Combine the results
      for (const response of responses) {
        if (response.status === 'OK') {
          allResults.push(...response.results);
        } else if (overallStatus === 'OK') {
          // Only update the status if it's still OK
          overallStatus = response.status;
          errorMessage = response.message || '';
        }
      }

      // If we got any results, consider it a success
      if (allResults.length > 0) {
        overallStatus = 'OK';
      }

      // Add a message about location accuracy if not accurate
      if (!isAccurate && overallStatus === 'OK') {
        errorMessage =
          'Using approximate location. For more accurate results, provide specific location parameters.';
      }

      // Sort and limit the results
      const sortedResults = this.sortAndLimitResults(
        allResults,
        sortBy,
        sortDesc,
        limit,
      );

      return {
        results: sortedResults,
        status: overallStatus,
        message: errorMessage,
      };
    } catch (error) {
      this.logger.error(
        `Error finding places by location: ${error.message}`,
        error.stack,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      return {
        results: [],
        status: 'ERROR',
        message: `Failed to fetch places: ${error.message}`,
      };
    }
  }

  /**
   * Find places of a single type by location
   * @param type The type of place to search for
   * @param location The reference location coordinates
   * @param radius The search radius in meters
   * @returns Promise with the search results
   */
  private async findSingleTypeByLocation(
    type: string,
    location: Coordinates,
    radius: number,
  ): Promise<MapsResponse> {
    try {
      // Construct the URL for the Google Places API Nearby Search
      const url = `${this.baseUrl}/nearbysearch/json`;

      // Make the request to the Google Places API
      const response = await axios.get(url, {
        params: {
          location: `${location.lat},${location.lng}`,
          radius,
          type,
          key: this.apiKey,
        },
      });

      // Process and transform the response
      if (response.data.status === 'OK') {
        const results: PlaceResult[] = response.data.results.map((place) => ({
          id: place.place_id,
          name: place.name,
          address: place.vicinity,
          location: place.geometry.location,
          types: place.types,
          rating: place.rating || 0,
          userRatingsTotal: place.user_ratings_total || 0,
          vicinity: place.vicinity,
          // Calculate distance if needed (can be done using the geometry library)
          distance: null, // Would need to calculate this
        }));

        return {
          results,
          status: 'OK',
        };
      }

      // Return the error status from Google
      return {
        results: [],
        status: response.data.status,
        message:
          response.data.error_message ||
          `Failed to fetch places of type: ${type}`,
      };
    } catch (error) {
      this.logger.error(
        `Error finding places of type ${type}: ${error.message}`,
        error.stack,
      );

      return {
        results: [],
        status: 'ERROR',
        message: `Failed to fetch places of type ${type}: ${error.message}`,
      };
    }
  }

  /**
   * Find a specific place by exact name match
   * @param query The exact name of the place to search for
   * @param location Optional reference location coordinates to bias results
   * @param userId Optional user ID to fetch user's default location
   * @param state State name to geocode (required if coordinates and city not provided)
   * @param city City name to geocode (required if coordinates and state not provided)
   * @param sortBy Field to sort results by (rating, distance, prominence)
   * @param sortDesc Whether to sort in descending order
   * @param limit Maximum number of results to return
   * @returns Promise with the search results
   */
  async findByExactMatch(
    query: string,
    location?: Coordinates,
    userId?: string,
    state?: string,
    city?: string,
    sortBy: string = 'rating',
    sortDesc: boolean = true,
    limit: number = 20,
  ): Promise<MapsResponse> {
    try {
      if (!this.apiKey) {
        return {
          results: [],
          status: 'ERROR',
          message: 'Google Maps API key is not configured',
        };
      }

      // Validate inputs
      if (!query) {
        return {
          results: [],
          status: 'INVALID_REQUEST',
          message: 'Missing required parameter: query',
        };
      }

      // Validate that either coordinates, state, or city is provided
      if ((!location || !location.lat || !location.lng) && !state && !city) {
        throw new BadRequestException(
          'Either coordinates (lat/lng), state, or city must be provided for location-based search',
        );
      }

      // Resolve location based on provided parameters
      const { coordinates, isAccurate } =
        await this.locationResolver.resolveLocation(
          userId,
          state,
          city,
          location,
        );

      this.logger.log(
        `Using location coordinates: ${JSON.stringify(coordinates)}, accurate: ${isAccurate}`,
      );

      // Construct the URL for the Google Places API Text Search
      const url = `${this.baseUrl}/textsearch/json`;

      // Prepare parameters
      const params: Record<string, string> = {
        query,
        key: this.apiKey,
      };

      // Add location bias
      params.location = `${coordinates.lat},${coordinates.lng}`;
      params.radius = '50000'; // 50km radius for location bias

      // Make the request to the Google Places API
      const response = await axios.get(url, { params });

      // Process and transform the response
      if (response.data.status === 'OK') {
        const results: PlaceResult[] = response.data.results.map((place) => ({
          id: place.place_id,
          name: place.name,
          address: place.formatted_address,
          location: place.geometry.location,
          types: place.types,
          rating: place.rating || 0,
          userRatingsTotal: place.user_ratings_total || 0,
          // Calculate distance if location is provided
          distance: null, // Would need to calculate this
        }));

        // Sort and limit the results
        const sortedResults = this.sortAndLimitResults(
          results,
          sortBy,
          sortDesc,
          limit,
        );

        // Add a message about location accuracy if not accurate
        const message = !isAccurate
          ? 'Using approximate location. For more accurate results, provide specific location parameters.'
          : '';

        return {
          results: sortedResults,
          status: 'OK',
          message,
        };
      }

      // Return the error status from Google
      return {
        results: [],
        status: response.data.status,
        message: response.data.error_message || 'Failed to fetch places',
      };
    } catch (error) {
      this.logger.error(
        `Error finding places by exact match: ${error.message}`,
        error.stack,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      return {
        results: [],
        status: 'ERROR',
        message: `Failed to fetch places: ${error.message}`,
      };
    }
  }

  /**
   * Sort and limit the results based on the specified criteria
   * @param results The results to sort and limit
   * @param sortBy The field to sort by (rating, distance, prominence)
   * @param sortDesc Whether to sort in descending order
   * @param limit The maximum number of results to return
   * @returns The sorted and limited results
   */
  private sortAndLimitResults(
    results: PlaceResult[],
    sortBy: string = 'rating',
    sortDesc: boolean = true,
    limit: number = 20,
  ): PlaceResult[] {
    // Make a copy of the results to avoid modifying the original
    const sortedResults = [...results];

    // Sort the results based on the specified criteria
    if (sortBy === 'rating') {
      sortedResults.sort((a, b) => {
        // Handle missing ratings (treat as 0)
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;

        // If ratings are equal, sort by number of ratings
        if (ratingA === ratingB) {
          const totalA = a.userRatingsTotal || 0;
          const totalB = b.userRatingsTotal || 0;
          return sortDesc ? totalB - totalA : totalA - totalB;
        }

        return sortDesc ? ratingB - ratingA : ratingA - ratingB;
      });
    } else if (
      sortBy === 'distance' &&
      results.some((r) => r.distance !== null)
    ) {
      // Only sort by distance if at least some results have distance information
      sortedResults.sort((a, b) => {
        const distanceA = a.distance || Number.MAX_SAFE_INTEGER;
        const distanceB = b.distance || Number.MAX_SAFE_INTEGER;
        return sortDesc ? distanceB - distanceA : distanceA - distanceB;
      });
    }
    // For 'prominence', we don't need to sort as Google already returns results by prominence

    // Limit the number of results
    return sortedResults.slice(0, limit);
  }
}
