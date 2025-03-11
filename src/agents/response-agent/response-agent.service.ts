/**
 * Response Agent Service
 *
 * Changes:
 * - Created the response agent service
 * - Implemented the Agent interface
 * - Added methods to verify and enhance the final response to the user
 * - Added forwardRef() to break circular dependency with OpenAiService
 * - Improved handling of property results in the data payload
 * - Added conversation history to the system message context
 * - Enhanced to better utilize previous agent results appended to conversation history
 * - Updated to use utility functions from conversation-utils.ts
 * - Improved handling of empty search results
 * - Enhanced empty results detection to check multiple data structures
 * - Expanded response appropriateness check for empty results
 * - Improved empty results response generation with better context utilization
 * - Added more comprehensive detection of property data in different formats
 * - Updated to provide more personalized responses based on properties in the data payload
 * - Added methods to generate personalized responses for both empty and non-empty results
 * - Improved response generation to focus on current data rather than previous messages
 * - Fixed detection of properties in searchResults.data array
 * - Corrected response generation to avoid apologizing when properties exist
 * - Updated to handle the final payload structure with searchResults.data
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { OpenAiService } from '../../openai/openai.service';
import {
  Agent,
  AgentInput,
  AgentOutput,
  ChatMessage,
} from '../interfaces/agent.interface';
import { RESPONSE_AGENT_SYSTEM_MESSAGE } from '../../openai/system-messages/response-agent';
import { extractPreviousAgentResult } from '../utils/conversation-utils';

@Injectable()
export class ResponseAgentService implements Agent {
  private readonly logger = new Logger(ResponseAgentService.name);

  name = 'ResponseAgent';
  description = 'Verifies and enhances the final response to the user';
  requiredInputs = ['response', 'data'];

  constructor(
    @Inject(forwardRef(() => OpenAiService))
    private readonly openAiService: OpenAiService,
  ) {}

  async canHandle(input: AgentInput): Promise<boolean> {
    // This agent can handle any input that has a response and data
    return (
      !!input.additionalContext?.response && !!input.additionalContext?.data
    );
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    try {
      this.logger.debug(`Processing response agent verification`);

      // Extract the response and data from the input
      const originalResponse = input.additionalContext?.response || '';
      const data = input.additionalContext?.data || {};

      // If there's no response to verify, return the original input
      if (!originalResponse) {
        this.logger.warn('No response to verify');
        return {
          response: input.query,
          data: data,
        };
      }

      // Check for empty search results using a comprehensive detection function
      const emptyResultsInfo = this.detectEmptyResults(data);
      const emptySearchResults = emptyResultsInfo.isEmpty;

      // Log the search results information for debugging
      this.logger.debug(
        `Empty results detection: ${JSON.stringify(emptyResultsInfo)}`,
      );

      if (emptySearchResults) {
        this.logger.debug('EMPTY SEARCH RESULTS DETECTED');

        // Generate an apologetic response asking the user to change their query
        const noPropertiesResponse = await this.generateNoPropertiesResponse(
          input.query,
          this.extractSearchCriteria(data),
        );

        return {
          response: noPropertiesResponse,
          data: {
            ...data,
            originalResponse,
            enhancementReasoning:
              'Generated apologetic response for no properties found',
          },
        };
      } else {
        this.logger.debug('PROPERTIES FOUND IN RESPONSE');

        // Generate a personalized response based on the properties
        const personalizedResponse = await this.generatePersonalizedResponse(
          input.query,
          data,
        );

        return {
          response: personalizedResponse,
          data: {
            ...data,
            originalResponse,
            enhancementReasoning:
              'Generated personalized response based on properties found',
          },
        };
      }
    } catch (error) {
      this.logger.error(
        `Error processing response verification: ${error.message}`,
        error.stack,
      );

      // In case of error, return the original response
      return {
        response: input.additionalContext?.response || input.query,
        data: input.additionalContext?.data || {},
      };
    }
  }

  /**
   * Comprehensive detection of empty results in different data structures
   * @param data The data object to check
   * @returns Object with isEmpty flag and details about where empty results were detected
   */
  private detectEmptyResults(data: any): { isEmpty: boolean; details: string } {
    // Initialize result
    let isEmpty = true;
    const details: string[] = [];

    // Check for the final payload structure with searchResults.data
    if (data.searchResults?.data !== undefined) {
      const resultsCount = Array.isArray(data.searchResults.data)
        ? data.searchResults.data.length
        : 0;
      if (
        Array.isArray(data.searchResults.data) &&
        data.searchResults.data.length > 0
      ) {
        isEmpty = false;
        details.push(`searchResults.data has ${resultsCount} items`);
      } else {
        details.push('searchResults.data is empty or not an array');
      }
    }

    // Check for properties directly in the data object (backward compatibility)
    if ('properties' in data) {
      const propertiesCount = Array.isArray(data.properties)
        ? data.properties.length
        : 0;
      if (Array.isArray(data.properties) && data.properties.length > 0) {
        isEmpty = false;
        details.push(`properties has ${propertiesCount} items`);
      } else {
        details.push('properties is empty or not an array');
      }
    }

    // Check filteredProperties
    if ('filteredProperties' in data) {
      const filteredCount = Array.isArray(data.filteredProperties)
        ? data.filteredProperties.length
        : 0;
      if (
        Array.isArray(data.filteredProperties) &&
        data.filteredProperties.length > 0
      ) {
        isEmpty = false;
        details.push(`filteredProperties has ${filteredCount} items`);
      } else {
        details.push('filteredProperties is empty or not an array');
      }
    }

    // Check validatedProperties
    if ('validatedProperties' in data) {
      const validatedCount = Array.isArray(data.validatedProperties)
        ? data.validatedProperties.length
        : 0;
      if (
        Array.isArray(data.validatedProperties) &&
        data.validatedProperties.length > 0
      ) {
        isEmpty = false;
        details.push(`validatedProperties has ${validatedCount} items`);
      } else {
        details.push('validatedProperties is empty or not an array');
      }
    }

    // Check if there's a validatedCount greater than 0
    if ('validatedCount' in data && data.validatedCount > 0) {
      isEmpty = false;
      details.push(`validatedCount is ${data.validatedCount}`);
    }

    // Check if there's a totalCount greater than 0
    if ('totalCount' in data && data.totalCount > 0) {
      isEmpty = false;
      details.push(`totalCount is ${data.totalCount}`);
    }

    // Check if there's metadata indicating results
    if (data.searchResults?.metadata?.matchingResults > 0) {
      isEmpty = false;
      details.push(
        `searchResults.metadata.matchingResults is ${data.searchResults.metadata.matchingResults}`,
      );
    }

    // Special check for the case where we have searchResults but no data property
    if (
      data.searchResults &&
      !data.searchResults.data &&
      data.searchResults.metadata?.matchingResults > 0
    ) {
      isEmpty = false;
      details.push(
        `searchResults.metadata.matchingResults is ${data.searchResults.metadata.matchingResults} but no data array`,
      );
    }

    // Log the details for debugging
    this.logger.debug(`Empty results detection details: ${details.join(', ')}`);

    return {
      isEmpty,
      details: details.join(', '),
    };
  }

  /**
   * Extract search criteria from data for better context in responses
   * @param data The data object
   * @returns A string representation of the search criteria
   */
  private extractSearchCriteria(data: any): string {
    let criteria = '';

    // Check for mongoQuery
    if (data.mongoQuery) {
      criteria = JSON.stringify(data.mongoQuery, null, 2);
    }

    // Check for extractedInputs
    if (data.extractedInputs) {
      if (criteria) criteria += '\n\n';
      criteria += `Extracted Inputs: ${JSON.stringify(data.extractedInputs, null, 2)}`;
    }

    // Check for location
    if (data.location) {
      if (criteria) criteria += '\n\n';
      criteria += `Location: ${typeof data.location === 'string' ? data.location : JSON.stringify(data.location)}`;
    }

    // Check for amenities
    if (data.amenities) {
      if (criteria) criteria += '\n\n';
      criteria += `Amenities: ${Array.isArray(data.amenities) ? data.amenities.join(', ') : data.amenities}`;
    }

    // If we still don't have criteria, use a generic message
    if (!criteria) {
      criteria = 'No specific search criteria found in data';
    }

    return criteria;
  }

  /**
   * Generate a response specifically for when no properties are found
   * @param query The original user query
   * @param searchCriteria The search criteria used
   * @returns A response apologizing for no results and suggesting to change the query
   */
  private async generateNoPropertiesResponse(
    query: string,
    searchCriteria: string,
  ): Promise<string> {
    try {
      const messages = [
        {
          role: 'system' as const,
          content: `You are Luna, a helpful real estate assistant. The user has searched for properties but NO RESULTS were found.

Generate a response that:
1. Apologizes to the user for not finding any properties matching their criteria
2. Clearly tells them to change their query or search parameters
3. Suggests specific modifications they could make based on their search criteria
4. Maintains a helpful and friendly tone

The response should be in Spanish and should be natural and conversational.

IMPORTANT: Focus ONLY on the current search criteria. DO NOT reference previous messages or conversation history.`,
        },
        {
          role: 'user' as const,
          content: `The user searched for: "${query}"
          
Search criteria: ${searchCriteria}

Generate an apologetic response suggesting they change their query.`,
        },
      ];

      const response = await this.openAiService.processConversation(messages);
      return response;
    } catch (error) {
      this.logger.error(
        `Error generating no properties response: ${error.message}`,
        error.stack,
      );
      return 'Lo siento, no pude encontrar propiedades que coincidan con tus criterios. Por favor, intenta modificar tu búsqueda para encontrar más opciones.';
    }
  }

  /**
   * Generate a personalized response based on the properties found
   * @param query The original user query
   * @param data The data object containing properties and other information
   * @returns A personalized response based on the properties found
   */
  private async generatePersonalizedResponse(
    query: string,
    data: any,
  ): Promise<string> {
    try {
      // Extract property information
      const propertyInfo = this.extractPropertyInformation(data);

      const messages = [
        {
          role: 'system' as const,
          content: `You are Luna, a helpful real estate assistant. The user has searched for properties and RESULTS WERE FOUND.

Generate a response that:
1. Is personalized and meaningful based on the specific properties found
2. Mentions the number of properties found
3. Includes key details from the search criteria (location, property type, amenities, etc.)
4. Is enthusiastic and encouraging
5. Invites the user to explore the results or ask for more details
6. If the number of properties is small (1-3), mentions some key features of the properties

The response should be in Spanish and should be natural and conversational.

IMPORTANT: 
- Focus ONLY on the current search results
- DO NOT reference previous messages or conversation history
- DO NOT use generic responses like "Aquí están los resultados" or "Encontré algunas propiedades"
- Make the response specific to the properties found and their characteristics
- NEVER apologize for not finding properties when properties were actually found
- Be enthusiastic about the properties that were found`,
        },
        {
          role: 'user' as const,
          content: `The user searched for: "${query}"
          
Property Information:
${propertyInfo}

Generate a personalized response based on the properties found.`,
        },
      ];

      const response = await this.openAiService.processConversation(messages);
      return response;
    } catch (error) {
      this.logger.error(
        `Error generating personalized response: ${error.message}`,
        error.stack,
      );
      return '¡Excelente! He encontrado propiedades que coinciden con tus criterios. ¿Te gustaría ver más detalles de alguna de ellas?';
    }
  }

  /**
   * Extract property information from the data object
   * @param data The data object containing properties and other information
   * @returns A string representation of the property information
   */
  private extractPropertyInformation(data: any): string {
    let propertyInfo = '';

    // Count properties from different sources
    let propertiesCount = 0;
    let properties: any[] = [];

    // Check for the final payload structure with searchResults.data
    if (
      data.searchResults?.data &&
      Array.isArray(data.searchResults.data) &&
      data.searchResults.data.length > 0
    ) {
      propertiesCount = data.searchResults.data.length;
      properties = data.searchResults.data;
      propertyInfo += `Number of properties: ${propertiesCount}\n\n`;

      // Add metadata information if available
      if (data.searchResults.metadata) {
        propertyInfo += `Metadata: ${JSON.stringify(data.searchResults.metadata, null, 2)}\n\n`;
      }
    }
    // Check for properties directly in the data object (backward compatibility)
    else if (Array.isArray(data.properties) && data.properties.length > 0) {
      propertiesCount = data.properties.length;
      properties = data.properties;
      propertyInfo += `Number of properties: ${propertiesCount}\n\n`;
    } else if (
      Array.isArray(data.filteredProperties) &&
      data.filteredProperties.length > 0
    ) {
      propertiesCount = data.filteredProperties.length;
      properties = data.filteredProperties;
      propertyInfo += `Number of properties: ${propertiesCount}\n\n`;
    } else if (
      Array.isArray(data.validatedProperties) &&
      data.validatedProperties.length > 0
    ) {
      propertiesCount = data.validatedProperties.length;
      properties = data.validatedProperties;
      propertyInfo += `Number of properties: ${propertiesCount}\n\n`;
    } else if (data.validatedCount > 0) {
      propertiesCount = data.validatedCount;
      propertyInfo += `Number of properties: ${propertiesCount}\n\n`;
    } else if (data.totalCount > 0) {
      propertiesCount = data.totalCount;
      propertyInfo += `Number of properties: ${propertiesCount}\n\n`;
    } else if (data.searchResults?.metadata?.matchingResults > 0) {
      propertiesCount = data.searchResults.metadata.matchingResults;
      propertyInfo += `Number of properties: ${propertiesCount}\n\n`;
    }

    // Add search criteria information
    if (data.mongoQuery) {
      propertyInfo += `Search Criteria: ${JSON.stringify(data.mongoQuery, null, 2)}\n\n`;
    }

    // Add location information
    if (data.location) {
      propertyInfo += `Location: ${typeof data.location === 'string' ? data.location : JSON.stringify(data.location)}\n\n`;
    }

    // Add amenities information
    if (data.amenities) {
      propertyInfo += `Amenities: ${Array.isArray(data.amenities) ? data.amenities.join(', ') : data.amenities}\n\n`;
    }

    // Add property type information
    if (data.propertyType) {
      propertyInfo += `Property Type: ${data.propertyType}\n\n`;
    }

    // Add price range information
    if (data.priceRange) {
      propertyInfo += `Price Range: ${JSON.stringify(data.priceRange)}\n\n`;
    }

    // Add extracted inputs information
    if (data.extractedInputs) {
      propertyInfo += `Extracted Inputs: ${JSON.stringify(data.extractedInputs, null, 2)}\n\n`;
    }

    // Add details of up to 3 properties if available
    if (properties.length > 0 && properties.length <= 3) {
      propertyInfo += 'Property Details:\n';

      properties.forEach((property, index) => {
        propertyInfo += `Property ${index + 1}:\n`;

        // Add basic property information
        if (property.title) propertyInfo += `Title: ${property.title}\n`;
        if (property.description)
          propertyInfo += `Description: ${property.description.substring(0, 100)}...\n`;
        if (property.price) propertyInfo += `Price: ${property.price}\n`;
        if (property.features?.bedrooms)
          propertyInfo += `Bedrooms: ${property.features.bedrooms}\n`;
        if (property.features?.bathrooms)
          propertyInfo += `Bathrooms: ${property.features.bathrooms}\n`;
        if (property.features?.constructionSize)
          propertyInfo += `Construction Size: ${property.features.constructionSize} m²\n`;
        if (property.features?.lotSize)
          propertyInfo += `Lot Size: ${property.features.lotSize} m²\n`;
        if (property.features?.parking)
          propertyInfo += `Parking: ${property.features.parking}\n`;
        if (property.features?.floors)
          propertyInfo += `Floors: ${property.features.floors}\n`;
        if (property.location) {
          const locationStr =
            typeof property.location === 'string'
              ? property.location
              : `${property.location.city || ''}, ${property.location.state || ''}, ${property.location.area || ''}`;
          propertyInfo += `Location: ${locationStr}\n`;
        }

        propertyInfo += '\n';
      });
    } else if (properties.length > 3) {
      // For more than 3 properties, add summary information
      propertyInfo += 'Properties Summary:\n';

      // Calculate average price
      const avgPrice =
        properties.reduce((sum, prop) => sum + (prop.price || 0), 0) /
        properties.length;
      propertyInfo += `Average Price: ${avgPrice.toFixed(2)}\n`;

      // Calculate bedroom range
      const bedroomCounts = properties
        .map((p) => p.features?.bedrooms || 0)
        .filter((count) => count > 0);
      if (bedroomCounts.length > 0) {
        const minBedrooms = Math.min(...bedroomCounts);
        const maxBedrooms = Math.max(...bedroomCounts);
        propertyInfo += `Bedroom Range: ${minBedrooms} - ${maxBedrooms}\n`;
      }

      // Calculate bathroom range
      const bathroomCounts = properties
        .map((p) => p.features?.bathrooms || 0)
        .filter((count) => count > 0);
      if (bathroomCounts.length > 0) {
        const minBathrooms = Math.min(...bathroomCounts);
        const maxBathrooms = Math.max(...bathroomCounts);
        propertyInfo += `Bathroom Range: ${minBathrooms} - ${maxBathrooms}\n`;
      }

      // Calculate construction size range
      const constructionSizes = properties
        .map((p) => p.features?.constructionSize || 0)
        .filter((size) => size > 0);
      if (constructionSizes.length > 0) {
        const minSize = Math.min(...constructionSizes);
        const maxSize = Math.max(...constructionSizes);
        propertyInfo += `Construction Size Range: ${minSize} - ${maxSize} m²\n`;
      }

      propertyInfo += '\n';
    }

    return propertyInfo;
  }

  /**
   * Format conversation history for context
   * @param conversationHistory The conversation history
   * @returns A formatted string of the conversation history
   */
  private formatConversationHistory(
    conversationHistory: ChatMessage[],
  ): string {
    if (!conversationHistory || conversationHistory.length === 0) {
      return 'No conversation history available';
    }

    return conversationHistory
      .map(
        (message) =>
          `${message.role === 'user' ? 'Usuario' : 'Luna'}: ${message.content}`,
      )
      .join('\n\n');
  }
}
