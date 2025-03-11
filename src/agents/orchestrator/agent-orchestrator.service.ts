/**
 * Agent Orchestrator Service
 *
 * Changes:
 * - Created the agent orchestrator service
 * - Implemented methods to register agents, determine which agent to use, and process queries
 * - Added support for handling missing inputs and feedback loops
 * - Added forwardRef() to break circular dependency with OpenAiService
 * - Improved combineResults method to properly merge MongoDB queries
 * - Enhanced mergeMongoQueries to handle empty queries and ensure valid MongoDB queries
 * - Updated to use utility functions from conversation-utils.ts for better context sharing
 * - Added ValidatorAgent to validate inputs before processing with other agents
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { OpenAiService } from '../../openai/openai.service';
import { Agent, AgentInput, AgentOutput } from '../interfaces/agent.interface';
import { ORCHESTRATOR_SYSTEM_MESSAGE } from '../../openai/system-messages/orchestator';
import { ChatMessage } from '../interfaces/agent.interface';
import { PropertyService } from '../../property/property.service';
import { ConversationService } from '../../conversation/conversation.service';
import { appendPreviousResultToConversationHistory } from '../utils/conversation-utils';

interface AgentDecision {
  agents: string[];
  extractedInputs: Record<string, any>;
  reasoning: string;
  isContinuation: boolean;
}

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);
  private agents: Agent[] = [];

  constructor(
    @Inject(forwardRef(() => OpenAiService))
    private readonly openAiService: OpenAiService,
    @Inject(forwardRef(() => PropertyService))
    private readonly propertyService: PropertyService,
    @Inject(forwardRef(() => ConversationService))
    private readonly conversationService: ConversationService,
  ) {}

  registerAgent(agent: Agent) {
    this.agents.push(agent);
    this.logger.log(`Registered agent: ${agent.name}`);
  }

  async processQuery(
    query: string,
    sessionId: string,
    conversationHistory: ChatMessage[],
  ): Promise<AgentOutput> {
    try {
      // 1. Get the search context from the conversation
      const searchContext =
        await this.conversationService.getSearchContext(sessionId);

      // 2. Analyze the query to determine which agent(s) to use
      const agentDecision = await this.determineAgents(
        query,
        conversationHistory,
        searchContext,
      );

      this.logger.debug(`Agent decision: ${JSON.stringify(agentDecision)}`);

      // 3. Update the search context with the new agent decision
      await this.conversationService.updateSearchContext(
        sessionId,
        agentDecision,
      );

      // 4. Validate the inputs with ValidatorAgent
      const validatorAgent = this.agents.find((agent) => agent.name === 'ValidatorAgent');
      if (validatorAgent) {
        this.logger.debug('Validating inputs with ValidatorAgent');
        
        const validationResult = await validatorAgent.process({
          query,
          conversationHistory,
          additionalContext: agentDecision.extractedInputs,
        });
        
        // If validation failed, return the validation error message
        if (validationResult.missingInputs && validationResult.missingInputs.length > 0) {
          this.logger.debug(
            `Validation failed: ${JSON.stringify(validationResult.missingInputs)}`,
          );
          return validationResult;
        }
        
        // If validation passed, continue with the validated inputs
        this.logger.debug('Validation passed, continuing with validated inputs');
      } else {
        this.logger.warn('ValidatorAgent not found, skipping validation');
      }

      // 5. Check if we need the MapsAgent (amenities search)
      const needsMapsAgent = agentDecision.agents.includes('MapsAgent');

      // 6. If we need the MapsAgent and have location and amenities, use a special flow
      if (
        needsMapsAgent &&
        agentDecision.extractedInputs.location &&
        agentDecision.extractedInputs.amenities
      ) {
        const result = await this.processMapsFirst(
          agentDecision,
          sessionId,
          query,
          conversationHistory,
        );

        // Apply ResponseAgent to enhance the final response
        // NOTE: ResponseAgent is now applied in the OpenAiController
        return result;
      }

      // 7. Find the agents that can handle this query
      const selectedAgents = agentDecision.agents
        .map((agentName) => this.agents.find((a) => a.name === agentName))
        .filter((agent) => agent !== undefined);

      if (selectedAgents.length === 0) {
        this.logger.warn(
          `No agents found for: ${agentDecision.agents.join(', ')}`,
        );
        return {
          response:
            'Lo siento, no puedo procesar esta solicitud en este momento.',
          data: { error: 'No agents available' },
        };
      }

      // 8. Check if we have all required inputs
      const missingInputs = this.checkMissingInputs(
        selectedAgents,
        agentDecision.extractedInputs,
      );

      // 9. If inputs are missing, generate a response asking for them
      if (missingInputs.length > 0) {
        return {
          response: this.generateMissingInputsResponse(
            missingInputs,
            agentDecision.reasoning,
          ),
          missingInputs,
          data: {
            agentDecision,
            missingInputs,
          },
        };
      }

      // 10. Process with the selected agents
      const result = await this.processWithAgents(selectedAgents, {
        query,
        conversationHistory,
        additionalContext: agentDecision.extractedInputs,
      });

      // 11. Update the search context with the MongoDB query if available
      if (result.data?.mongoQuery) {
        await this.conversationService.updateSearchContext(
          sessionId,
          agentDecision,
          result.data.mongoQuery,
        );
      }

      // 12. Apply ResponseAgent to enhance the final response
      // NOTE: ResponseAgent is now applied in the OpenAiController
      return result;
    } catch (error) {
      this.logger.error(
        `Error processing query with agents: ${error.message}`,
        error.stack,
      );
      return {
        response:
          'Lo siento, ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo.',
        data: { error: error.message },
      };
    }
  }

  private async determineAgents(
    query: string,
    conversationHistory: ChatMessage[],
    searchContext?: any,
  ): Promise<AgentDecision> {
    // Use OpenAI to analyze the query and determine which agent(s) to use
    const messages: ChatMessage[] = [
      { role: 'system', content: ORCHESTRATOR_SYSTEM_MESSAGE },
      ...conversationHistory,
    ];

    // Add search context if available
    if (searchContext) {
      messages.push({
        role: 'system',
        content: `Previous search context: ${JSON.stringify(searchContext)}`,
      });
    }

    // Add the current query
    messages.push({ role: 'user', content: query });

    const response = await this.openAiService.processConversationToJson<{
      agents: string[];
      extractedInputs: Record<string, any>;
      reasoning: string;
      isContinuation: boolean;
    }>(messages);

    // If this is a continuation and we have search context, merge the extracted inputs
    if (
      response.isContinuation &&
      searchContext &&
      searchContext.extractedInputs
    ) {
      this.logger.debug(
        'Detected continuation, merging with previous search context',
      );

      // Merge the query if needed
      if (searchContext.query && response.extractedInputs.query) {
        response.extractedInputs.query = this.combineQueries(
          searchContext.query,
          response.extractedInputs.query,
        );
      } else if (searchContext.query) {
        response.extractedInputs.query = searchContext.query;
      }

      // Keep the location if not provided in the new query
      if (searchContext.location && !response.extractedInputs.location) {
        response.extractedInputs.location = searchContext.location;
      }

      // Merge amenities if needed
      if (searchContext.amenities && response.extractedInputs.amenities) {
        response.extractedInputs.amenities = [
          ...new Set([
            ...searchContext.amenities,
            ...response.extractedInputs.amenities,
          ]),
        ];
      } else if (searchContext.amenities) {
        response.extractedInputs.amenities = searchContext.amenities;
      }

      // Keep the logical operator if not provided in the new query
      if (
        searchContext.logicalOperator &&
        !response.extractedInputs.logicalOperator
      ) {
        response.extractedInputs.logicalOperator =
          searchContext.logicalOperator;
      }
    }

    return {
      agents: response.agents || [],
      extractedInputs: response.extractedInputs || {},
      reasoning: response.reasoning || '',
      isContinuation: response.isContinuation || false,
    };
  }

  /**
   * Combine two queries into one
   * @param previousQuery The previous query
   * @param newQuery The new query
   * @returns The combined query
   */
  private combineQueries(previousQuery: string, newQuery: string): string {
    // If the new query starts with a continuation phrase, combine them
    const continuationPhrases = [
      'that has',
      'with',
      'and also',
      'also',
      'that is',
      'that are',
      'that',
    ];

    for (const phrase of continuationPhrases) {
      if (newQuery.toLowerCase().startsWith(phrase)) {
        return `${previousQuery} ${newQuery}`;
      }
    }

    // If the new query doesn't start with a continuation phrase,
    // check if it's a complete query or just additional criteria
    if (
      newQuery.toLowerCase().includes('quiero') ||
      newQuery.toLowerCase().includes('busco') ||
      newQuery.toLowerCase().includes('necesito')
    ) {
      // This is likely a new query, not a continuation
      return newQuery;
    }

    // Default to combining the queries
    return `${previousQuery} ${newQuery}`;
  }

  private checkMissingInputs(
    agents: Agent[],
    extractedInputs: Record<string, any>,
  ): string[] {
    const missingInputs: string[] = [];

    for (const agent of agents) {
      for (const input of agent.requiredInputs) {
        if (!extractedInputs[input] && !missingInputs.includes(input)) {
          missingInputs.push(input);
        }
      }
    }

    return missingInputs;
  }

  private generateMissingInputsResponse(
    missingInputs: string[],
    reasoning: string,
  ): string {
    // For now, use a simple template. In a more sophisticated implementation,
    // we could use OpenAI to generate a more natural response.

    const inputMap: Record<string, string> = {
      location: 'ubicación',
      amenities: 'tipos de servicios cercanos',
      propertyId: 'identificador de la propiedad',
      query: 'consulta',
    };

    const translatedInputs = missingInputs.map(
      (input) => inputMap[input] || input,
    );

    return `Claro! Para ayudarte mejor, necesito saber ${translatedInputs.join(' y ')}.`;
  }

  private async processWithAgents(
    agents: Agent[],
    input: AgentInput,
  ): Promise<AgentOutput> {
    // Always prioritize FilterAgent to run first
    const filterAgent = agents.find((agent) => agent.name === 'FilterAgent');
    const mapsAgent = agents.find((agent) => agent.name === 'MapsAgent');
    // Remove ResponseAgent handling from here since we handle it at a higher level
    const otherAgents = agents.filter(
      (agent) => agent.name !== 'FilterAgent' && agent.name !== 'MapsAgent',
    );

    // Reorder agents to ensure FilterAgent runs first, then MapsAgent, then others
    const orderedAgents = [
      ...(filterAgent ? [filterAgent] : []),
      ...(mapsAgent ? [mapsAgent] : []),
      ...otherAgents,
    ];

    this.logger.debug(
      `Processing with agents in order: ${orderedAgents.map((a) => a.name).join(', ')}`,
    );

    // If there are no agents, return an error
    if (orderedAgents.length === 0) {
      return {
        response:
          'Lo siento, no puedo procesar esta solicitud en este momento.',
        data: { error: 'No agents available' },
      };
    }

    // If there's only one agent, just use it
    if (orderedAgents.length === 1) {
      return orderedAgents[0].process(input);
    }

    // Execute agents sequentially, passing results from one to the next
    let currentResult: AgentOutput | null = null;
    let properties: any[] = [];

    // Special case for FilterAgent + MapsAgent
    if (
      filterAgent &&
      mapsAgent &&
      orderedAgents.length === 2 &&
      input.additionalContext?.location &&
      input.additionalContext?.amenities
    ) {
      this.logger.debug(
        'Using special case for FilterAgent + MapsAgent with location and amenities',
      );

      // Process with FilterAgent first to get properties
      const filterResult = await filterAgent.process(input);

      // If we have a mongoQuery, execute it to get properties
      if (filterResult.data?.mongoQuery) {
        try {
          const queryResult = await this.propertyService.executeQuery({
            query: JSON.stringify(filterResult.data.mongoQuery),
            options: filterResult.data.sort
              ? { sort: filterResult.data.sort }
              : undefined,
          });

          properties = queryResult.data;

          // Add properties to the result data
          filterResult.data.properties = properties;
        } catch (error) {
          this.logger.error(
            `Error executing query: ${error.message}`,
            error.stack,
          );
        }
      }

      // Process with MapsAgent to filter properties by proximity
      const mapsInput: AgentInput = {
        query: input.query,
        // Enhance conversation history with the previous agent result
        conversationHistory: appendPreviousResultToConversationHistory(
          input.conversationHistory,
          filterResult,
        ),
        additionalContext: {
          ...input.additionalContext,
          properties,
        },
      };

      const mapsResult = await mapsAgent.process(mapsInput);

      // Combine the results
      currentResult = await this.combineResults([filterResult, mapsResult]);
    } else {
      // Process with each agent in sequence
      for (const agent of orderedAgents) {
        this.logger.debug(`Processing with agent: ${agent.name}`);

        // If this is the first agent, use the original input
        if (!currentResult) {
          currentResult = await agent.process(input);
          continue;
        }

        // For subsequent agents, pass the current result as additional context
        // and enhance the conversation history with the previous agent result
        const agentInput: AgentInput = {
          query: input.query,
          conversationHistory: appendPreviousResultToConversationHistory(
            input.conversationHistory,
            currentResult,
          ),
          additionalContext: {
            ...input.additionalContext,
            ...currentResult.data,
          },
        };

        const agentResult = await agent.process(agentInput);

        // Combine the results
        currentResult = await this.combineResults([currentResult, agentResult]);
      }
    }

    // If we don't have a result, return an error
    if (!currentResult) {
      return {
        response:
          'Lo siento, no puedo procesar esta solicitud en este momento.',
        data: { error: 'No result from agents' },
      };
    }

    // Return the result (ResponseAgent will be applied at a higher level)
    return currentResult;
  }

  private async combineResults(results: AgentOutput[]): Promise<AgentOutput> {
    // Combine the data from all agents
    const combinedData: Record<string, any> = {};

    // Extract valid responses (non-empty and not error messages)
    const validResponses: string[] = [];

    // Extract and combine MongoDB queries
    const mongoQueries = results
      .filter((result) => result.data?.mongoQuery)
      .map((result) => result.data?.mongoQuery);

    // If we have MongoDB queries, merge them
    if (mongoQueries.length > 0) {
      combinedData.mongoQuery = this.mergeMongoQueries(mongoQueries);
    }

    // Combine other data
    for (const result of results) {
      // Add data from this agent
      if (result.data) {
        Object.entries(result.data).forEach(([key, value]) => {
          if (key !== 'mongoQuery') {
            combinedData[key] = value;
          }
        });
      }

      // Check if the response is valid
      if (
        result.response &&
        !result.response.includes('Lo siento, no puedo procesar') &&
        !result.response.includes('ocurrió un error')
      ) {
        validResponses.push(result.response);
      }
    }

    let combinedResponse: string;

    // If we have multiple valid responses, use OpenAI to generate a cohesive response
    if (validResponses.length > 1) {
      try {
        const messages = [
          {
            role: 'system' as const,
            content: `You are Luna, a real estate agent. You need to combine multiple responses into a single coherent response.
                     The responses may contain overlapping or complementary information.
                     Create a single, natural-sounding response that incorporates all the relevant information.
                     Avoid repetition and contradictions.`,
          },
          {
            role: 'user' as const,
            content: `Please combine these responses into a single coherent response:
                     ${validResponses.map((r, i) => `Response ${i + 1}: ${r}`).join('\n\n')}`,
          },
        ];

        combinedResponse =
          await this.openAiService.processConversation(messages);
      } catch (error) {
        this.logger.error(
          `Error combining responses: ${error.message}`,
          error.stack,
        );
        // Fallback to the first valid response if OpenAI fails
        combinedResponse = validResponses[0];
      }
    } else {
      // If we have only one valid response or none, use it or a default message
      combinedResponse =
        validResponses.length > 0
          ? validResponses[0]
          : results[0]?.response ||
            'Lo siento, no puedo procesar esta solicitud en este momento.';
    }

    return {
      response: combinedResponse,
      data: combinedData,
    };
  }

  private mergeMongoQueries(
    queries: Record<string, any>[],
  ): Record<string, any> {
    // Filter out null, undefined, and empty queries
    const nonEmptyQueries = queries.filter(
      (query) =>
        query && typeof query === 'object' && Object.keys(query).length > 0,
    );

    this.logger.debug(
      `Merging ${nonEmptyQueries.length} MongoDB queries: ${JSON.stringify(nonEmptyQueries)}`,
    );

    // If there are no non-empty queries, return an empty object
    if (nonEmptyQueries.length === 0) {
      this.logger.debug('No valid queries to merge, returning empty query');
      return {};
    }

    // If there's only one query, return it
    if (nonEmptyQueries.length === 1) {
      this.logger.debug('Only one valid query, returning it directly');
      return nonEmptyQueries[0];
    }

    // Merge multiple queries using $and operator
    this.logger.debug(
      `Merging ${nonEmptyQueries.length} queries with $and operator`,
    );
    return {
      $and: nonEmptyQueries,
    };
  }

  /**
   * Process a query with MapsAgent first, then FilterAgent, and cross-validate the results
   * @param agentDecision The agent decision
   * @param sessionId The session ID
   * @param query The original query
   * @param conversationHistory The conversation history
   * @returns The agent output
   */
  private async processMapsFirst(
    agentDecision: AgentDecision,
    sessionId: string,
    query: string,
    conversationHistory: ChatMessage[],
  ): Promise<AgentOutput> {
    try {
      this.logger.debug('Processing with MapsAgent first flow');

      // Find the MapsAgent and FilterAgent
      const mapsAgent = this.agents.find((agent) => agent.name === 'MapsAgent');
      const filterAgent = this.agents.find(
        (agent) => agent.name === 'FilterAgent',
      );

      if (!mapsAgent || !filterAgent) {
        this.logger.warn('MapsAgent or FilterAgent not found');
        return {
          response:
            'Lo siento, no puedo procesar esta solicitud en este momento.',
          data: { error: 'Required agents not available' },
        };
      }

      // Validate inputs with ValidatorAgent before processing with MapsAgent
      const validatorAgent = this.agents.find((agent) => agent.name === 'ValidatorAgent');
      if (validatorAgent) {
        this.logger.debug('Validating inputs with ValidatorAgent before MapsAgent');
        
        const validationResult = await validatorAgent.process({
          query,
          conversationHistory,
          additionalContext: {
            location: agentDecision.extractedInputs.location,
            amenities: agentDecision.extractedInputs.amenities,
            logicalOperator: agentDecision.extractedInputs.logicalOperator || 'OR',
          },
        });
        
        // If validation failed, return the validation error message
        if (validationResult.missingInputs && validationResult.missingInputs.length > 0) {
          this.logger.debug(
            `Validation failed: ${JSON.stringify(validationResult.missingInputs)}`,
          );
          return validationResult;
        }
        
        // If validation passed, continue with the validated inputs
        this.logger.debug('Validation passed, continuing with validated inputs');
      }

      // 1. Process with MapsAgent first to get nearby places
      const mapsInput: AgentInput = {
        query,
        conversationHistory,
        additionalContext: {
          location: agentDecision.extractedInputs.location,
          amenities: agentDecision.extractedInputs.amenities,
          logicalOperator:
            agentDecision.extractedInputs.logicalOperator || 'OR',
        },
      };

      const mapsResult = await mapsAgent.process(mapsInput);

      // 2. If we have nearby places, use them to filter properties
      if (mapsResult.data?.nearbyPlaces) {
        // 3. Process with FilterAgent to get properties
        const filterInput: AgentInput = {
          query,
          // Enhance conversation history with the MapsAgent result
          conversationHistory: appendPreviousResultToConversationHistory(
            conversationHistory,
            mapsResult,
          ),
          additionalContext: {
            ...agentDecision.extractedInputs,
            nearbyPlaces: mapsResult.data.nearbyPlaces,
          },
        };

        const filterResult = await filterAgent.process(filterInput);

        // 4. If we have a mongoQuery, execute it to get properties
        if (filterResult.data?.mongoQuery) {
          try {
            const queryResult = await this.propertyService.executeQuery({
              query: JSON.stringify(filterResult.data.mongoQuery),
              options: filterResult.data.sort
                ? { sort: filterResult.data.sort }
                : undefined,
            });

            const properties = queryResult.data;

            // 5. Cross-validate properties with nearby places
            const validatedProperties = this.crossValidateResults(
              properties,
              mapsResult.data.nearbyPlaces,
              agentDecision.extractedInputs.logicalOperator || 'OR',
            );

            // 6. Combine the results
            return {
              response: filterResult.response,
              data: {
                ...filterResult.data,
                ...mapsResult.data,
                properties: validatedProperties,
                originalProperties: properties,
                validatedCount: validatedProperties.length,
                totalCount: properties.length,
              },
            };
          } catch (error) {
            this.logger.error(
              `Error executing query: ${error.message}`,
              error.stack,
            );

            // If there's an error, return the filter result
            return filterResult;
          }
        }

        // If there's no mongoQuery, return the filter result
        return filterResult;
      }

      // If there are no nearby places, return the maps result
      return mapsResult;
    } catch (error) {
      this.logger.error(
        `Error processing with MapsAgent first: ${error.message}`,
        error.stack,
      );

      // In case of error, return a generic response
      return {
        response:
          'Lo siento, ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo.',
        data: { error: error.message },
      };
    }
  }

  /**
   * Cross-validate properties with nearby places to find properties near amenities
   * @param properties The properties to check
   * @param nearbyPlacesResponses The nearby places responses from MapsAgent
   * @param logicalOperator The logical operator (AND or OR)
   * @returns The properties that are near amenities
   */
  private crossValidateResults(
    properties: any[],
    nearbyPlacesResponses: any[],
    logicalOperator: string = 'OR',
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
      this.logger.warn('No place coordinates found for cross-validation');
      return properties;
    }

    this.logger.debug(
      `Found ${allPlaceCoordinates.length} place coordinates for cross-validation`,
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
        'No properties with coordinates found for cross-validation',
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
        // For AND, we need at least one place of each type within 10km
        // Group distances by type
        const typeGroups: Record<string, any[]> = {};
        distances.forEach((d) => {
          if (!typeGroups[d.type]) {
            typeGroups[d.type] = [];
          }
          typeGroups[d.type].push(d);
        });

        // Check if each type has at least one place within 10km
        return Object.values(typeGroups).every((group) =>
          group.some((d) => d.distance <= 10),
        );
      } else {
        // For OR, we need at least one place of any type within 10km
        return distances.some((d) => d.distance <= 10);
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
}
