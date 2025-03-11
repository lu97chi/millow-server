/**
 * Filter Agent Service
 *
 * Changes:
 * - Created the filter agent service
 * - Implemented the Agent interface
 * - Added methods to handle property filtering queries
 * - Added forwardRef() to break circular dependency with OpenAiService
 * - Removed static cities list and implemented dynamic location detection
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { OpenAiService } from '../../openai/openai.service';
import { Agent, AgentInput, AgentOutput } from '../interfaces/agent.interface';
import { SYSTEM_MESSAGE } from '../../openai/system-messages/filter-agent';

@Injectable()
export class FilterAgentService implements Agent {
  private readonly logger = new Logger(FilterAgentService.name);

  name = 'FilterAgent';
  description = 'Handles property filtering queries';
  requiredInputs = ['query'];

  constructor(
    @Inject(forwardRef(() => OpenAiService))
    private readonly openAiService: OpenAiService,
  ) {}

  async canHandle(input: AgentInput): Promise<boolean> {
    // Simple implementation - can handle any query that doesn't require location-based filtering
    // In a more sophisticated implementation, we could use OpenAI to determine if this agent can handle the query
    return (
      !input.query.toLowerCase().includes('cerca') &&
      !input.query.toLowerCase().includes('cercano')
    );
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    try {
      this.logger.debug(`Processing filter agent query: ${input.query}`);

      const messages = [
        { role: 'system' as const, content: SYSTEM_MESSAGE },
        ...input.conversationHistory,
        { role: 'user' as const, content: input.query },
      ];

      interface FilterResponse {
        message: string;
        mongoQuery: Record<string, any>;
        extraActions?: Record<string, any>[];
        sort?: Record<string, 1 | -1>;
        projection?: Record<string, 1 | 0>;
      }

      const response =
        await this.openAiService.processConversationToJson<FilterResponse>(
          messages,
        );

      // Log the response for debugging
      this.logger.debug(`Filter agent response: ${JSON.stringify(response)}`);

      // Validate that mongoQuery exists and is not empty
      if (
        !response.mongoQuery ||
        Object.keys(response.mongoQuery).length === 0
      ) {
        this.logger.warn(
          `Empty or missing mongoQuery in filter agent response for query: ${input.query}`,
        );

        // Create a basic query based on the input if possible
        const basicQuery = await this.createBasicQuery(input.query);
        this.logger.debug(`Created basic query: ${JSON.stringify(basicQuery)}`);

        return {
          response:
            response.message ||
            'Aquí tienes algunas propiedades que podrían interesarte.',
          data: {
            mongoQuery: basicQuery,
            extraActions: response.extraActions,
            sort: response.sort,
            projection: response.projection,
          },
        };
      }

      return {
        response: response.message,
        data: {
          mongoQuery: response.mongoQuery,
          extraActions: response.extraActions,
          sort: response.sort,
          projection: response.projection,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error processing with filter agent: ${error.message}`,
        error.stack,
      );
      return {
        response:
          'Lo siento, tuve un problema procesando tu solicitud de búsqueda de propiedades.',
        data: { error: error.message },
      };
    }
  }

  /**
   * Create a basic MongoDB query based on the user's input
   * This is a fallback method when the AI doesn't generate a proper query
   */
  private async createBasicQuery(query: string): Promise<Record<string, any>> {
    const lowercaseQuery = query.toLowerCase();
    const basicQuery: Record<string, any> = {};

    // Check for property type
    if (lowercaseQuery.includes('casa')) {
      basicQuery.propertyType = 'Casas';
    } else if (lowercaseQuery.includes('departamento')) {
      basicQuery.propertyType = 'Departamentos';
    }

    // Check for location using AI instead of static list
    try {
      const locationDetectionPrompt = `
        Extract any Mexican city or location mentioned in this query. 
        If no specific city or location is mentioned, return null.
        Query: "${query}"
        
        Return a JSON object with this format:
        {
          "location": "city_name" // or null if no location is found
        }
      `;
      
      interface LocationResponse {
        location: string | null;
      }
      
      const locationResponse = await this.openAiService.processConversationToJson<LocationResponse>(
        [
          {
            role: 'user',
            content: locationDetectionPrompt
          }
        ]
      );
      
      if (locationResponse.location) {
        basicQuery['location.city'] = { $regex: locationResponse.location, $options: 'i' };
        this.logger.debug(`Detected location: ${locationResponse.location}`);
      }
    } catch (error) {
      this.logger.error(`Error detecting location: ${error.message}`);
      // Continue without location filter if there's an error
    }

    // Check for operation type
    if (lowercaseQuery.includes('renta') || lowercaseQuery.includes('rentar')) {
      basicQuery.operationType = 'Renta';
    } else if (
      lowercaseQuery.includes('venta') ||
      lowercaseQuery.includes('comprar')
    ) {
      basicQuery.operationType = 'Venta';
    }

    // If we couldn't create any filters, return a simple query that will match most properties
    if (Object.keys(basicQuery).length === 0) {
      return { status: 'available' };
    }

    return basicQuery;
  }
}
