/**
 * Location Resolver Service
 *
 * Changes:
 * - Created service to resolve user location preferences
 * - Implemented methods to get user's default location
 * - Added support for geocoding state/city names to coordinates
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Coordinates } from '../interfaces/maps.interfaces';

// Interface for geocoding response
interface GeocodingResult {
  coordinates: Coordinates;
  formattedAddress: string;
}

@Injectable()
export class LocationResolverService {
  private readonly logger = new Logger(LocationResolverService.name);
  private readonly apiKey: string | undefined;
  private readonly defaultLocation: Coordinates;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');

    // Default location (can be configured in environment variables)
    // Default to Mexico City if not specified
    this.defaultLocation = {
      lat: this.configService.get<number>('DEFAULT_LOCATION_LAT') || 19.4326,
      lng: this.configService.get<number>('DEFAULT_LOCATION_LNG') || -99.1332,
    };

    if (!this.apiKey) {
      this.logger.warn(
        'Google Maps API key is not set. Geocoding functionality will be limited.',
      );
    }
  }

  /**
   * Get location coordinates based on user preferences and request parameters
   * @param userId Optional user ID to fetch user's default location
   * @param state Optional state name to geocode
   * @param city Optional city name to geocode
   * @param explicitCoordinates Optional explicit coordinates provided in the request
   * @returns Resolved coordinates and a flag indicating if they're accurate
   */
  async resolveLocation(
    userId?: string,
    state?: string,
    city?: string,
    explicitCoordinates?: Coordinates,
  ): Promise<{ coordinates: Coordinates; isAccurate: boolean }> {
    try {
      // Priority 1: Use explicit coordinates if provided
      if (explicitCoordinates?.lat && explicitCoordinates?.lng) {
        return {
          coordinates: explicitCoordinates,
          isAccurate: true,
        };
      }

      // Priority 2: Use state/city if provided
      if (state || city) {
        const locationQuery = [city, state].filter(Boolean).join(', ');
        if (locationQuery) {
          try {
            const geocodingResult = await this.geocodeAddress(locationQuery);
            return {
              coordinates: geocodingResult.coordinates,
              isAccurate: true,
            };
          } catch (error) {
            this.logger.warn(
              `Failed to geocode location "${locationQuery}": ${error.message}`,
            );
            // Continue to next priority if geocoding fails
          }
        }
      }

      // Priority 3: Use user's default location if userId is provided
      if (userId) {
        try {
          const userLocation = await this.getUserDefaultLocation(userId);
          if (userLocation) {
            return {
              coordinates: userLocation,
              isAccurate: true,
            };
          }
        } catch (error) {
          this.logger.warn(
            `Failed to get default location for user ${userId}: ${error.message}`,
          );
          // Continue to next priority if user location lookup fails
        }
      }

      // Priority 4: Use system default location
      return {
        coordinates: this.defaultLocation,
        isAccurate: false,
      };
    } catch (error) {
      this.logger.error(
        `Error resolving location: ${error.message}`,
        error.stack,
      );

      // Fallback to default location
      return {
        coordinates: this.defaultLocation,
        isAccurate: false,
      };
    }
  }

  /**
   * Get a user's default location from the database
   * @param userId The user ID
   * @returns The user's default location coordinates
   */
  async getUserDefaultLocation(userId: string): Promise<Coordinates | null> {
    // TODO: Implement user location lookup from database
    // This is a placeholder implementation
    this.logger.log(`Getting default location for user ${userId}`);

    // For now, return null to fall back to the next priority
    return null;
  }

  /**
   * Geocode an address string to coordinates
   * @param address The address to geocode (e.g., "Guadalajara, Jalisco")
   * @returns The geocoded coordinates and formatted address
   */
  async geocodeAddress(address: string): Promise<GeocodingResult> {
    if (!this.apiKey) {
      throw new Error('Google Maps API key is not configured');
    }

    try {
      // Add "Mexico" to the address if not already included to improve results
      if (!address.toLowerCase().includes('mexico')) {
        address = `${address}, Mexico`;
      }

      const url = 'https://maps.googleapis.com/maps/api/geocode/json';
      const response = await axios.get(url, {
        params: {
          address,
          key: this.apiKey,
        },
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        return {
          coordinates: {
            lat: result.geometry.location.lat,
            lng: result.geometry.location.lng,
          },
          formattedAddress: result.formatted_address,
        };
      }

      throw new Error(`Geocoding failed: ${response.data.status}`);
    } catch (error) {
      this.logger.error(
        `Error geocoding address "${address}": ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to geocode address: ${error.message}`);
    }
  }
}
