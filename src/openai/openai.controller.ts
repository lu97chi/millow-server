/**
 * OpenAI Controller
 * 
 * Changes:
 * - Added a new route for property context queries
 * - The new route fetches property information and adds it to the chat context
 * - Modified property-query endpoint to not return property information in the response
 * - Updated to store currentPropertyId in conversation for better context handling
 */
import { Controller, Post, Body, HttpCode, UsePipes, ValidationPipe, HttpException, HttpStatus, Inject, forwardRef, Logger } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { QueryDto } from './dto/query.dto';
import { PropertyQueryDto } from './dto/property-query.dto';
import { PropertyService } from '../property/property.service';
import { ConversationService } from '../conversation/conversation.service';
import { Property } from '../property/schemas/property.schema';
import { QueryResult } from '../property/interfaces/query-result.interface';
import { PROPERTY_DETAILS, formatPropertyDetails } from './system-messages/property-details';

interface QueryResponse {
  sessionId: string;
  response: string;
  searchResults: QueryResult<Property>;
  mongoQuery?: Record<string, any>;
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
  ) { }

  @Post('query')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true }))
  async processQuery(@Body() queryDto: QueryDto): Promise<QueryResponse> {
    try {
      let sessionId = queryDto.sessionId;

      // If no sessionId provided, create a new session
      if (!sessionId) {
        sessionId = await this.conversationService.createSession();
      }

      // Get existing conversation to access previous query context
      let conversation = await this.conversationService.getConversation(sessionId);
      const previousMongoQuery = conversation?.mongoQuery || {};

      // Add message to conversation and get AI response
      conversation = await this.conversationService.addMessage({
        sessionId,
        content: queryDto.message,
        role: 'user'
      });

      // Process the message to get property search query
      const aiResponse = await this.openAiService.processQueryToJson(queryDto.message);

      let searchResults: QueryResult<Property> = {
        data: [],
        metadata: {
          executionTime: 0,
          statistics: {
            totalInDatabase: 0,
            matchingResults: 0,
            percentageMatch: 0
          }
        }
      };

      // If we got a valid query, merge it with previous query and execute
      if (aiResponse && aiResponse.mongoQuery) {
        // Merge the new query with the previous query context
        const mergedQuery = this.mergeQueries(previousMongoQuery, aiResponse.mongoQuery);

        // Check if the merged query has any filtering criteria
        const hasFilters = Object.keys(mergedQuery).length > 0;

        // Only execute the query if there are actual filters
        if (hasFilters) {
          // Ensure strict filtering by transforming the query
          const strictQuery = this.ensureStrictFiltering(mergedQuery);
          this.logger.debug(`Previous query: ${JSON.stringify(previousMongoQuery)}`);
          this.logger.debug(`New query: ${JSON.stringify(aiResponse.mongoQuery)}`);
          this.logger.debug(`Merged query: ${JSON.stringify(mergedQuery)}`);
          this.logger.debug(`Strict query: ${JSON.stringify(strictQuery)}`);

          const executeQueryDto = {
            query: JSON.stringify(strictQuery),
            options: {
              sort: aiResponse.sort,
              projection: aiResponse.projection
            }
          };

          searchResults = await this.propertyService.executeQuery(executeQueryDto);

          // Store the merged query in the conversation for future reference
          conversation.mongoQuery = mergedQuery;
          await conversation.save();
        }
      }

      // Get the last AI response from the conversation
      const lastMessage = conversation.messages[conversation.messages.length - 1];

      return {
        sessionId,
        response: lastMessage.content,
        searchResults,
        mongoQuery: conversation.mongoQuery || {}
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to process query',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('property-query')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true }))
  async processPropertyQuery(@Body() propertyQueryDto: PropertyQueryDto): Promise<PropertyQueryResponse> {
    try {
      const { message, propertyId, sessionId: providedSessionId } = propertyQueryDto;

      // Get the property information
      const property = await this.propertyService.findOne(propertyId);

      // Create or get session.
      let sessionId = providedSessionId;
      if (!sessionId) {
        sessionId = await this.conversationService.createSession();
      }

      // Get or create conversation
      let conversation = await this.conversationService.getConversation(sessionId);
      if (!conversation) {
        // Create a new conversation if it doesn't exist
        sessionId = await this.conversationService.createSession();
        conversation = await this.conversationService.getConversation(sessionId);
        
        // If still null after creation, throw an error
        if (!conversation) {
          throw new HttpException('Failed to create conversation', HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }

      // Create property context message
      const propertyContextMessage = this.createPropertyContextMessage(property);

      // Store the current property ID in the conversation
      conversation.currentPropertyId = propertyId;
      await conversation.save();

      // Always add the property context as a system message for this request
      // This ensures the property details are included in the context
      await this.conversationService.addMessage({
        sessionId,
        content: propertyContextMessage,
        role: 'system'
      });

      // Refresh conversation after adding system message
      conversation = await this.conversationService.getConversation(sessionId);
      
      // If still null after refresh, throw an error
      if (!conversation) {
        throw new HttpException('Failed to retrieve conversation after update', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // Add user message
      conversation = await this.conversationService.addMessage({
        sessionId,
        content: message,
        role: 'user'
      });

      // Get the last AI response from the conversation
      const lastMessage = conversation.messages[conversation.messages.length - 1];

      // Return only the sessionId and response, omitting the property information
      return {
        sessionId,
        response: lastMessage.content
      };
    } catch (error) {
      this.logger.error(`Error processing property query: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to process property query',
        HttpStatus.INTERNAL_SERVER_ERROR
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
  private mergeQueries(prevQuery: Record<string, any>, newQuery: Record<string, any>): Record<string, any> {
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
  private ensureStrictFiltering(query: Record<string, any>): Record<string, any> {
    const strictQuery = { ...query };

    // Add any transformations needed for strict filtering
    // For example, ensure text searches use exact phrases

    return strictQuery;
  }
} 