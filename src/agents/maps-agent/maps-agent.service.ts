/**
 * Maps Agent Service
 *
 * Changes:
 * - Created the maps agent service
 * - Implemented the Agent interface
 * - Added methods to handle location-based queries and nearby amenities
 * - Added support for multiple amenities with logical operators (AND/OR)
 * - Added forwardRef() to break circular dependency with OpenAiService
 * - Added MongoDB query generation for properties near amenities
 * - Fixed location handling in MongoDB query generation
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { OpenAiService } from '../../openai/openai.service';
import { MapsService } from '../../maps/maps.service';
import { Agent, AgentInput, AgentOutput } from '../interfaces/agent.interface';
import { GOOGLE_MAPS_ROLE } from '../../openai/system-messages/google-maps-agent';

@Injectable()
export class MapsAgentService implements Agent {
  private readonly logger = new Logger(MapsAgentService.name);

  name = 'MapsAgent';
  description = 'Handles location-based queries and nearby amenities';
  requiredInputs = ['location', 'amenities'];

  constructor(
    @Inject(forwardRef(() => OpenAiService))
    private readonly openAiService: OpenAiService,
    private readonly mapsService: MapsService,
  ) {}

  async canHandle(input: AgentInput): Promise<boolean> {
    // Can handle queries about nearby amenities
    return (
      input.query.toLowerCase().includes('cerca') ||
      input.query.toLowerCase().includes('cercano')
    );
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    try {
      // Extract location and amenities from input
      const location = input.additionalContext?.location;
      const amenities = input.additionalContext?.amenities || [];
      const logicalOperator = input.additionalContext?.logicalOperator || 'OR';
      const properties = input.additionalContext?.properties || [];

      this.logger.debug(
        `Processing maps agent with location: ${location}, amenities: ${amenities.join(', ')}, logicalOperator: ${logicalOperator}`,
      );
      this.logger.debug(
        `Received ${properties.length} properties from FilterAgent`,
      );

      // Check if we have all required inputs
      if (!location || !amenities || amenities.length === 0) {
        return {
          response: 'Necesito más información para buscar lugares cercanos.',
          missingInputs: [
            !location ? 'location' : null,
            !amenities || amenities.length === 0 ? 'amenities' : null,
          ].filter(Boolean) as string[],
        };
      }

      // Find nearby places for each amenity
      const allNearbyPlaces = await Promise.all(
        amenities.map((amenity) =>
          this.mapsService.findByLocation(
            [amenity],
            undefined,
            20000, // 20km radius
            undefined,
            typeof location === 'string' ? location : undefined,
            typeof location === 'string' ? location : undefined,
          ),
        ),
      );

      // Generate a response that includes all amenity types
      const amenitiesText =
        logicalOperator === 'AND'
          ? amenities.join(' Y ')
          : amenities.join(' O ');
      const messages = [
        { role: 'system' as const, content: GOOGLE_MAPS_ROLE },
        {
          role: 'user' as const,
          content: `Encontré estos lugares cercanos: ${JSON.stringify(allNearbyPlaces)}. Por favor, genera una respuesta natural para el usuario que preguntó sobre ${amenitiesText} cerca de ${location}.`,
        },
      ];

      const response = await this.openAiService.processConversation(messages);

      return {
        response,
        data: {
          nearbyPlaces: allNearbyPlaces,
          location,
          amenities,
          logicalOperator,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error processing with maps agent: ${error.message}`,
        error.stack,
      );
      return {
        response:
          'Lo siento, tuve un problema procesando tu solicitud de búsqueda de lugares cercanos.',
        data: { error: error.message },
      };
    }
  }

  private async processWithAndOperator(
    location: string,
    amenities: string[],
    input: AgentInput,
  ): Promise<AgentOutput> {
    // For AND operator, we need to find places that satisfy all amenity types
    // This means finding properties that are near all types of amenities

    const allNearbyPlaces = await Promise.all(
      amenities.map((amenity) =>
        this.mapsService.findByLocation(
          [amenity],
          undefined,
          20000, // Increased to 20km (20,000 meters)
          undefined,
          typeof location === 'string' ? location : undefined,
          typeof location === 'string' ? location : undefined,
        ),
      ),
    );

    // Generate a MongoDB query to find properties in the location
    // and include coordinates of nearby places for distance filtering
    const mongoQuery = this.generateMongoQueryWithProximity(
      location,
      allNearbyPlaces,
      'AND',
    );

    // Generate a response that includes all amenity types
    const amenitiesText = amenities.join(' Y ');
    const messages = [
      { role: 'system' as const, content: GOOGLE_MAPS_ROLE },
      {
        role: 'user' as const,
        content: `Encontré estos lugares cercanos: ${JSON.stringify(allNearbyPlaces)}. Por favor, genera una respuesta natural para el usuario que preguntó sobre ${amenitiesText} cerca de ${location}. El usuario quiere propiedades que estén cerca de TODOS estos servicios (operador lógico AND).`,
      },
    ];

    const response = await this.openAiService.processConversation(messages);

    return {
      response,
      data: {
        nearbyPlaces: allNearbyPlaces,
        location,
        amenities,
        logicalOperator: 'AND',
        mongoQuery: mongoQuery,
      },
    };
  }

  private async processWithOrOperator(
    location: string,
    amenities: string[],
    input: AgentInput,
  ): Promise<AgentOutput> {
    // For OR operator, we need to find places that satisfy any amenity type
    // This is simpler - just find properties near any of the amenity types

    const allNearbyPlaces = await Promise.all(
      amenities.map((amenity) =>
        this.mapsService.findByLocation(
          [amenity],
          undefined,
          20000, // Increased to 20km (20,000 meters)
          undefined,
          typeof location === 'string' ? location : undefined,
          typeof location === 'string' ? location : undefined,
        ),
      ),
    );

    // Generate a MongoDB query to find properties in the location
    // and include coordinates of nearby places for distance filtering
    const mongoQuery = this.generateMongoQueryWithProximity(
      location,
      allNearbyPlaces,
      'OR',
    );

    // Generate a response that includes all amenity types
    const amenitiesText = amenities.join(' O ');
    const messages = [
      { role: 'system' as const, content: GOOGLE_MAPS_ROLE },
      {
        role: 'user' as const,
        content: `Encontré estos lugares cercanos: ${JSON.stringify(allNearbyPlaces)}. Por favor, genera una respuesta natural para el usuario que preguntó sobre ${amenitiesText} cerca de ${location}. El usuario quiere propiedades que estén cerca de CUALQUIERA de estos servicios (operador lógico OR).`,
      },
    ];

    const response = await this.openAiService.processConversation(messages);

    return {
      response,
      data: {
        nearbyPlaces: allNearbyPlaces,
        location,
        amenities,
        logicalOperator: 'OR',
        mongoQuery: mongoQuery,
      },
    };
  }

  /**
   * Process properties from FilterAgent and filter them by proximity to amenities
   * @param location The location string
   * @param amenities Array of amenity types
   * @param properties Array of properties from FilterAgent
   * @param logicalOperator 'AND' or 'OR' operator
   * @param input The original input
   * @returns AgentOutput with filtered properties
   */
  private async processWithProperties(
    location: string,
    amenities: string[],
    properties: any[],
    logicalOperator: string,
    input: AgentInput,
  ): Promise<AgentOutput> {
    this.logger.debug(
      `Processing ${properties.length} properties with ${amenities.length} amenities using ${logicalOperator} operator`,
    );

    // Find nearby places for each amenity
    const allNearbyPlaces = await Promise.all(
      amenities.map((amenity) =>
        this.mapsService.findByLocation(
          [amenity],
          undefined,
          20000, // 20km radius
          undefined,
          typeof location === 'string' ? location : undefined,
          typeof location === 'string' ? location : undefined,
        ),
      ),
    );

    // Filter properties by proximity to nearby places
    const filteredProperties = this.filterPropertiesByProximity(
      properties,
      allNearbyPlaces,
      logicalOperator,
    );

    this.logger.debug(
      `Filtered from ${properties.length} to ${filteredProperties.length} properties based on proximity`,
    );

    // Generate a response that includes all amenity types
    const amenitiesText =
      logicalOperator === 'AND' ? amenities.join(' Y ') : amenities.join(' O ');
    const messages = [
      { role: 'system' as const, content: GOOGLE_MAPS_ROLE },
      {
        role: 'user' as const,
        content: `Encontré ${filteredProperties.length} propiedades cerca de ${amenitiesText} en ${location}. Por favor, genera una respuesta natural para el usuario que preguntó sobre ${amenitiesText} cerca de ${location}.`,
      },
    ];

    const response = await this.openAiService.processConversation(messages);

    return {
      response,
      data: {
        nearbyPlaces: allNearbyPlaces,
        location,
        amenities,
        logicalOperator,
        filteredProperties,
      },
    };
  }

  /**
   * Filter properties by proximity to nearby places
   * @param properties Array of properties to filter
   * @param nearbyPlacesResponses Array of nearby places responses
   * @param logicalOperator 'AND' or 'OR' operator
   * @returns Filtered array of properties
   */
  private filterPropertiesByProximity(
    properties: any[],
    nearbyPlacesResponses: any[],
    logicalOperator: string,
  ): any[] {
    // Extract all place coordinates from the results
    const allPlaceCoordinates = nearbyPlacesResponses.flatMap((response) =>
      response.results.map((place: any) => ({
        lat: place.location.lat,
        lng: place.location.lng,
        name: place.name,
        type: place.types[0] || 'place',
      })),
    );

    // If we don't have any place coordinates, return all properties
    if (allPlaceCoordinates.length === 0) {
      this.logger.warn('No place coordinates found for proximity filtering');
      return properties;
    }

    this.logger.debug(
      `Found ${allPlaceCoordinates.length} place coordinates for proximity filtering`,
    );

    // Filter properties that have coordinates
    const propertiesWithCoordinates = properties.filter(
      (property) =>
        property.location &&
        property.location.coordinates &&
        property.location.coordinates.lat &&
        property.location.coordinates.lng,
    );

    if (propertiesWithCoordinates.length === 0) {
      this.logger.warn(
        'No properties with coordinates found for proximity filtering',
      );
      return properties;
    }

    this.logger.debug(
      `Found ${propertiesWithCoordinates.length} properties with coordinates`,
    );

    // Filter properties by distance
    return propertiesWithCoordinates.filter((property) => {
      // Calculate distance to each coordinate
      const distances = allPlaceCoordinates.map((coord) => ({
        distance: this.calculateDistance(
          property.location.coordinates.lat,
          property.location.coordinates.lng,
          coord.lat,
          coord.lng,
        ),
        name: coord.name,
        type: coord.type,
      }));

      // Apply logical operator
      if (logicalOperator === 'AND') {
        // For AND, we need at least one place of each amenity type within 20km
        // Group distances by type
        const typeGroups: Record<string, any[]> = {};
        distances.forEach((d) => {
          if (!typeGroups[d.type]) {
            typeGroups[d.type] = [];
          }
          typeGroups[d.type].push(d);
        });

        // Check if each type has at least one place within 20km
        return Object.values(typeGroups).every((group) =>
          group.some((d) => d.distance <= 20),
        );
      } else {
        // For OR, we need at least one place of any type within 20km
        return distances.some((d) => d.distance <= 20);
      }
    });
  }

  /**
   * Calculate distance between two coordinates using the Haversine formula
   * @param lat1 Latitude of first point
   * @param lng1 Longitude of first point
   * @param lat2 Latitude of second point
   * @param lng2 Longitude of second point
   * @returns Distance in kilometers
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLng = this.deg2rad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
  }

  /**
   * Convert degrees to radians
   * @param deg Degrees
   * @returns Radians
   */
  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Generate a MongoDB query that filters properties by location and proximity to amenities
   * @param location The location string
   * @param nearbyPlaces Array of nearby places responses
   * @param logicalOperator 'AND' or 'OR' operator for combining proximity conditions
   * @returns MongoDB query object
   */
  private generateMongoQueryWithProximity(
    location: string | any,
    nearbyPlaces: any[],
    logicalOperator: 'AND' | 'OR',
  ): Record<string, any> {
    this.logger.debug(
      `Generating MongoDB query with proximity for location: ${JSON.stringify(location)}`,
    );

    // First, get the base location query
    const locationQuery = this.generateMongoQueryForLocation(location);

    // Extract all place coordinates from the results
    const allPlaceCoordinates = nearbyPlaces.flatMap((response) =>
      response.results.map((place: any) => ({
        lat: place.location.lat,
        lng: place.location.lng,
        name: place.name,
        type: place.types[0] || 'place',
      })),
    );

    // If we don't have any place coordinates, just return the location query
    if (allPlaceCoordinates.length === 0) {
      this.logger.warn('No place coordinates found for proximity filtering');
      return locationQuery;
    }

    this.logger.debug(
      `Found ${allPlaceCoordinates.length} place coordinates for proximity filtering`,
    );

    // For now, we'll use a simplified approach since we don't have geospatial queries
    // In a real implementation, you would use $near or $geoWithin with the coordinates

    // We'll add a custom field to the query to indicate that we want to filter by proximity
    // This will be processed by a custom middleware or in the controller
    const proximityFilter = {
      _proximityFilter: {
        coordinates: allPlaceCoordinates,
        maxDistance: 20, // 20km
        logicalOperator: logicalOperator,
      },
    };

    // Combine the location query with the proximity filter
    return { ...locationQuery, ...proximityFilter };
  }

  private generateMongoQueryForLocation(
    location: string | any,
  ): Record<string, any> {
    // Generate a MongoDB query to find properties in the specified location
    // This is a simple implementation - in a real-world scenario, you might want to use
    // geospatial queries to find properties within a certain radius of the amenities

    this.logger.debug(
      `Generating MongoDB query for location: ${JSON.stringify(location)}`,
    );

    // Handle different location formats
    if (typeof location === 'string' && location.trim() !== '') {
      // If location is a non-empty string, search by city name
      return {
        'location.city': { $regex: location, $options: 'i' },
      };
    } else if (location && typeof location === 'object') {
      // If location is an object, it might have city, state, or coordinates
      if (
        location.city &&
        typeof location.city === 'string' &&
        location.city.trim() !== ''
      ) {
        return {
          'location.city': { $regex: location.city, $options: 'i' },
        };
      } else if (
        location.state &&
        typeof location.state === 'string' &&
        location.state.trim() !== ''
      ) {
        return {
          'location.state': { $regex: location.state, $options: 'i' },
        };
      } else if (location.lat && location.lng) {
        // If we have coordinates, we could do a geospatial query
        // This is a simplified version - in a real implementation, you'd use $near or $geoWithin
        return {
          'location.coordinates': {
            $exists: true,
          },
        };
      }
    }

    // Fallback to a query that will match all properties
    // This is not ideal, but prevents errors
    this.logger.warn(
      `Could not generate specific location query for: ${JSON.stringify(location)}`,
    );
    return {};
  }
}
