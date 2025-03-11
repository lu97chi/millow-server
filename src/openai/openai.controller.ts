/**
 * OpenAI Controller
 *
 * Changes:
 * - Added a new route for property context queries
 * - The new route fetches property information and adds it to the chat context
 * - Modified property-query endpoint to not return property information in the response
 * - Updated to store currentPropertyId in conversation for better context handling
 * - Fixed extraActions property in the response of the query endpoint
 * - Added ResponseAgentService to enhance the final response to the user
 */
import {
  Controller,
  Post,
  Body,
  HttpCode,
  UsePipes,
  ValidationPipe,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { QueryDto } from './dto/query.dto';
import { PropertyQueryDto } from './dto/property-query.dto';
import { PropertyService } from '../property/property.service';
import { ConversationService } from '../conversation/conversation.service';
import { Property } from '../property/schemas/property.schema';
import { QueryResult } from '../property/interfaces/query-result.interface';
import {
  PROPERTY_DETAILS,
  formatPropertyDetails,
} from './system-messages/propert-agent';
import { AgentOrchestratorService } from '../agents/orchestrator/agent-orchestrator.service';
import { ConversationDocument } from '../conversation/schemas/conversation.schema';
import { ChatMessage } from '../agents/interfaces/agent.interface';
import { ResponseAgentService } from '../agents/response-agent/response-agent.service';

interface QueryResponse {
  sessionId: string;
  response: string;
  searchResults: QueryResult<Property>;
  mongoQuery?: Record<string, any>;
  extraActions?: Record<string, any>[];
}

interface PropertyQueryResponse {
  sessionId: string;
  response: string;
}

@Controller('')
export class OpenAiController {
  private readonly logger = new Logger(OpenAiController.name);

  constructor(
    private readonly openAiService: OpenAiService,
    private readonly propertyService: PropertyService,
    @Inject(forwardRef(() => ConversationService))
    private readonly conversationService: ConversationService,
    private readonly agentOrchestratorService: AgentOrchestratorService,
    private readonly responseAgentService: ResponseAgentService,
  ) {}

  @Post('query')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true }))
  async processQuery(@Body() queryDto: QueryDto): Promise<QueryResponse> {
    try {
      let sessionId = queryDto.sessionId;

      // Get or create conversation
      let conversation;
      if (!sessionId) {
        sessionId = await this.conversationService.createSession();
        conversation =
          await this.conversationService.getConversation(sessionId);
      } else {
        conversation =
          await this.conversationService.getConversation(sessionId);
        if (!conversation) {
          sessionId = await this.conversationService.createSession();
          conversation =
            await this.conversationService.getConversation(sessionId);
        }
      }

      // Get conversation history
      const conversationHistory = this.prepareConversationHistory(conversation);

      this.logger.debug(
        `Processing query with ${conversationHistory.length} messages in history`,
      );

      // Process the query using the agent orchestrator
      const result = await this.agentOrchestratorService.processQuery(
        queryDto.message,
        sessionId,
        conversationHistory,
      );

      // Save the conversation
      await this.conversationService.addMessage({
        sessionId,
        content: queryDto.message,
        role: 'user',
      });

      await this.conversationService.addMessage({
        sessionId,
        content: result.response,
        role: 'assistant',
      });

      // If we have missing inputs, return early with a request for more information
      if (result.missingInputs && result.missingInputs.length > 0) {
        return {
          sessionId,
          response: result.response,
          searchResults: {
            data: [],
            metadata: {
              executionTime: 0,
              statistics: {
                totalInDatabase: 0,
                matchingResults: 0,
                percentageMatch: 0,
              },
            },
          },
        };
      }

      // If we have properties directly in the result, use them
      if (result.data?.properties && Array.isArray(result.data.properties)) {
        this.logger.debug(
          `Using ${result.data.properties.length} properties from result`,
        );

        return {
          sessionId,
          response: result.response,
          searchResults: {
            data: result.data.properties,
            metadata: {
              executionTime: 0,
              statistics: {
                totalInDatabase: result.data.properties.length,
                matchingResults: result.data.properties.length,
                percentageMatch: 100,
              },
            },
          },
          mongoQuery: result.data?.mongoQuery,
          extraActions: result.data?.extraActions,
        };
      }

      // Execute MongoDB query if present
      let searchResults: QueryResult<Property> = {
        data: [],
        metadata: {
          executionTime: 0,
          statistics: {
            totalInDatabase: 0,
            matchingResults: 0,
            percentageMatch: 0,
          },
        },
      };

      if (
        result.data?.mongoQuery &&
        typeof result.data.mongoQuery === 'object' &&
        Object.keys(result.data.mongoQuery).length > 0
      ) {
        try {
          this.logger.debug(
            `Executing MongoDB query: ${JSON.stringify(result.data.mongoQuery)}`,
          );

          // Validate the query structure to ensure it's a valid MongoDB query
          const isValidQuery = this.isValidMongoQuery(result.data.mongoQuery);

          if (isValidQuery) {
            const executeQueryDto = {
              query: JSON.stringify(result.data.mongoQuery),
              options: {
                sort: result.data.sort,
                projection: result.data.projection,
              },
            };

            searchResults =
              await this.propertyService.executeQuery(executeQueryDto);

            this.logger.debug(
              `Query returned ${searchResults.data.length} results`,
            );

            // If we have properties from the MapsAgent filtering, use those instead
            if (
              result.data.properties &&
              Array.isArray(result.data.properties)
            ) {
              this.logger.debug(
                `Using ${result.data.properties.length} filtered properties from MapsAgent`,
              );
              searchResults.data = result.data.properties;
              searchResults.metadata.statistics.matchingResults =
                result.data.properties.length;
            }
          } else {
            this.logger.warn(
              `Invalid MongoDB query structure: ${JSON.stringify(result.data.mongoQuery)}`,
            );
            // Use a default query to return some results
            const defaultQuery = { status: 'available' };
            this.logger.debug(
              `Using default query: ${JSON.stringify(defaultQuery)}`,
            );

            const executeQueryDto = {
              query: JSON.stringify(defaultQuery),
              options: {
                // Empty options object as required by ExecuteQueryDto
              },
            };

            searchResults =
              await this.propertyService.executeQuery(executeQueryDto);
          }
        } catch (error) {
          this.logger.error(
            `Error executing MongoDB query: ${error.message}`,
            error.stack,
          );
          // Continue with empty results instead of failing the entire request

          // Try with a default query
          try {
            const defaultQuery = { status: 'available' };
            this.logger.debug(
              `Using default query after error: ${JSON.stringify(defaultQuery)}`,
            );

            const executeQueryDto = {
              query: JSON.stringify(defaultQuery),
              options: {
                // Empty options object as required by ExecuteQueryDto
              },
            };

            searchResults =
              await this.propertyService.executeQuery(executeQueryDto);
          } catch (fallbackError) {
            this.logger.error(
              `Error executing fallback query: ${fallbackError.message}`,
              fallbackError.stack,
            );
          }
        }
      } else {
        this.logger.debug('No MongoDB query to execute or empty query');

        // Use a default query to return some results
        try {
          const defaultQuery = { status: 'available' };
          this.logger.debug(
            `Using default query for empty case: ${JSON.stringify(defaultQuery)}`,
          );

          const executeQueryDto = {
            query: JSON.stringify(defaultQuery),
            options: {
              // Empty options object as required by ExecuteQueryDto
            },
          };

          searchResults =
            await this.propertyService.executeQuery(executeQueryDto);
        } catch (error) {
          this.logger.error(
            `Error executing default query: ${error.message}`,
            error.stack,
          );
        }
      }

      // HERE SHOULD BE THE RESPONSE AGENT
      // Apply the ResponseAgentService to enhance the final response
      try {
        this.logger.debug(
          'Applying ResponseAgentService to enhance the final response',
        );

        // Check if the ResponseAgentService can handle this input
        const canHandle = await this.responseAgentService.canHandle({
          query: queryDto.message,
          conversationHistory,
          additionalContext: {
            response: result.response,
            data: {
              ...result.data,
              searchResults,
            },
          },
        });

        if (canHandle) {
          this.logger.debug('ResponseAgentService can handle this input');

          // Process with the ResponseAgentService
          const enhancedResult = await this.responseAgentService.process({
            query: queryDto.message,
            conversationHistory,
            additionalContext: {
              response: result.response,
              data: {
                ...result.data,
                searchResults,
              },
            },
          });

          this.logger.debug(`Enhanced response: "${enhancedResult.response}"`);

          // Update the result with the enhanced response
          result.response = enhancedResult.response;

          // Merge any additional data from the enhanced result
          if (enhancedResult.data) {
            result.data = {
              ...result.data,
              ...enhancedResult.data,
            };
          }
        } else {
          this.logger.debug(
            'ResponseAgentService cannot handle this input, using original response',
          );
        }
      } catch (error) {
        this.logger.error(
          `Error applying ResponseAgentService: ${error.message}`,
          error.stack,
        );
        // Continue with the original response in case of error
      }

      return {
        sessionId,
        response: result.response,
        searchResults,
        mongoQuery: result.data?.mongoQuery,
        extraActions: result.data?.extraActions,
      };
    } catch (error) {
      this.logger.error(
        `Error processing query: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        error.message || 'Failed to process query',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('property-query')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true }))
  async processPropertyQuery(
    @Body() propertyQueryDto: PropertyQueryDto,
  ): Promise<PropertyQueryResponse> {
    try {
      const {
        message,
        propertyId,
        sessionId: providedSessionId,
      } = propertyQueryDto;

      // Get the property information
      const property = await this.propertyService.findOne(propertyId);

      // Create or get session.
      let sessionId = providedSessionId;
      if (!sessionId) {
        sessionId = await this.conversationService.createSession();
      }

      // Get or create conversation
      let conversation =
        await this.conversationService.getConversation(sessionId);
      if (!conversation) {
        // Create a new conversation if it doesn't exist
        sessionId = await this.conversationService.createSession();
        conversation =
          await this.conversationService.getConversation(sessionId);

        // If still null after creation, throw an error
        if (!conversation) {
          throw new HttpException(
            'Failed to create conversation',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }

      // Create property context message
      const propertyContextMessage =
        this.createPropertyContextMessage(property);

      // Store the current property ID in the conversation
      conversation.currentPropertyId = propertyId;
      await conversation.save();

      // Always add the property context as a system message for this request
      // This ensures the property details are included in the context
      await this.conversationService.addMessage({
        sessionId,
        content: propertyContextMessage,
        role: 'system',
      });

      // Refresh conversation after adding system message
      conversation = await this.conversationService.getConversation(sessionId);

      // If still null after refresh, throw an error
      if (!conversation) {
        throw new HttpException(
          'Failed to retrieve conversation after update',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Add user message
      conversation = await this.conversationService.addMessage({
        sessionId,
        content: message,
        role: 'user',
      });

      // Get the last AI response from the conversation
      const lastMessage =
        conversation.messages[conversation.messages.length - 1];

      // Return only the sessionId and response, omitting the property information
      return {
        sessionId,
        response: lastMessage.content,
      };
    } catch (error) {
      this.logger.error(
        `Error processing property query: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        error.message || 'Failed to process property query',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Create a system message with property context
   * @param property The property to create context for
   * @returns A formatted system message with property details
   */
  private createPropertyContextMessage(property: Property): string {
    const propertyDetails = formatPropertyDetails(property);

    // Create a detailed context message
    return PROPERTY_DETAILS(propertyDetails);
  }

  /**
   * Merge two MongoDB queries
   * @param prevQuery Previous query object
   * @param newQuery New query object
   * @returns Merged query object
   */
  private mergeQueries(
    prevQuery: Record<string, any>,
    newQuery: Record<string, any>,
  ): Record<string, any> {
    const mergedQuery = { ...prevQuery };

    // Merge each field from the new query into the previous query
    for (const [key, value] of Object.entries(newQuery)) {
      // If the field doesn't exist in the previous query, add it
      if (!mergedQuery[key]) {
        mergedQuery[key] = value;
        continue;
      }

      // If both are objects (but not arrays), merge them recursively
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof mergedQuery[key] === 'object' &&
        mergedQuery[key] !== null &&
        !Array.isArray(mergedQuery[key])
      ) {
        mergedQuery[key] = this.mergeQueries(mergedQuery[key], value);
      }
      // Otherwise, prefer the new value
      else {
        mergedQuery[key] = value;
      }
    }

    return mergedQuery;
  }

  /**
   * Ensure strict filtering by transforming the query
   * @param query MongoDB query object
   * @returns Transformed query for strict filtering
   */
  private ensureStrictFiltering(
    query: Record<string, any>,
  ): Record<string, any> {
    const strictQuery = { ...query };

    // Add any transformations needed for strict filtering
    // For example, ensure text searches use exact phrases

    return strictQuery;
  }

  // Helper method to prepare conversation history for the agent orchestrator
  private prepareConversationHistory(
    conversation: ConversationDocument,
  ): ChatMessage[] {
    if (
      !conversation ||
      !conversation.messages ||
      conversation.messages.length === 0
    ) {
      return [];
    }

    return conversation.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  // Helper method to validate a MongoDB query
  private isValidMongoQuery(query: Record<string, any>): boolean {
    if (!query || typeof query !== 'object') {
      return false;
    }

    // Check for empty query
    if (Object.keys(query).length === 0) {
      return false;
    }

    // Check for invalid regex patterns
    try {
      // Recursively check all properties for regex patterns
      const checkRegexPatterns = (obj: any): boolean => {
        if (!obj || typeof obj !== 'object') {
          return true;
        }

        for (const [key, value] of Object.entries(obj)) {
          // Check if this is a regex operator
          if (key === '$regex') {
            // Ensure the regex value is a string or RegExp object
            if (
              typeof value !== 'string' &&
              !(value instanceof RegExp) &&
              typeof value !== 'object'
            ) {
              this.logger.warn(`Invalid regex value: ${JSON.stringify(value)}`);
              return false;
            }
          } else if (typeof value === 'object' && value !== null) {
            // Recursively check nested objects
            if (!checkRegexPatterns(value)) {
              return false;
            }
          }
        }
        return true;
      };

      return checkRegexPatterns(query);
    } catch (error) {
      this.logger.error(`Error validating MongoDB query: ${error.message}`);
      return false;
    }
  }
}
