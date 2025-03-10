import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
//import { SYSTEM_MESSAGE, CREDIT_SYSTEM_MESSAGE } from 'src/openai/system-messages/filtering';
import { SYSTEM_MESSAGE, CREDIT_SYSTEM_MESSAGE } from './system-messages/filtering';

// Interface for the MongoDB query response
interface AiQueryResponse {
  mongoQuery: Record<string, any>;
  explanation: string;
  sort?: Record<string, 1 | -1>;
  projection?: Record<string, 1 | 0>;
}

// Interface for the Luna response format
interface LunaResponse {
  message: string;
  query: Record<string, any>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class OpenAiService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAiService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.error('OpenAI API key is not set');
      throw new Error('OpenAI API key is not set');
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }

  /**
   * Process a conversation with context and history
   * @param messages Array of messages including system context and conversation history
   * @returns The response from OpenAI
   */
  async processConversation(messages: ChatMessage[]): Promise<string> {
    try {
      // Check if this is a property-specific conversation
      const isPropertySpecificQuery = messages.some(msg =>
        msg.role === 'system' && msg.content.includes('DETALLES DE LA PROPIEDAD')
      );

      const isCreditQuery = messages.some(msg =>
        msg.role === 'system' && msg.content.includes('DETALLES DEL CREDITO')
      ) || messages.some(msg =>
        msg.role === 'user' && (
          msg.content.toLowerCase().includes('credito') ||
          msg.content.toLowerCase().includes('préstamo')
        )
      );

      // Ensure we have the base system message first
      const allMessages = isPropertySpecificQuery
        ? [...messages]
        : isCreditQuery
          ? [{ role: 'system' as const, content: CREDIT_SYSTEM_MESSAGE }, ...messages]
          : [{ role: 'system' as const, content: SYSTEM_MESSAGE }, ...messages];

      // Use a higher temperature for property-specific queries for more natural responses
      const temperature = isPropertySpecificQuery || isCreditQuery ? 0.7 : 0.5;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',  // Using GPT-4o for better context understanding
        messages: allMessages,
        temperature,
      });

      return response.choices[0].message.content || 'No response generated';
    } catch (error) {
      this.logger.error(`Error processing conversation: ${error.message}`, error.stack);
      throw new Error(`Failed to process conversation: ${error.message}`);
    }
  }

  /**
   * Send a query to OpenAI and get a response
   * @param query The user's query
   * @returns The response from OpenAI
   */
  async processQuery(query: string, isCreditQuery = false): Promise<string> {
    try {
      const systemMessage = isCreditQuery ? CREDIT_SYSTEM_MESSAGE : SYSTEM_MESSAGE;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',  // You can change this to the model you want to use
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: query }
        ],
        temperature: 0.7,
      });

      return response.choices[0].message.content || 'No response generated';
    } catch (error) {
      this.logger.error(`Error processing OpenAI query: ${error.message}`, error.stack);
      throw new Error(`Failed to process query: ${error.message}`);
    }
  }

  /**
   * Extract structured data from text using OpenAI
   * @param prompt The prompt describing the extraction task
   * @returns JSON string containing the extracted data
   */
  async extractStructuredData(prompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a data extraction assistant. Extract structured information from the user message according to the instructions.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });
  
      return response.choices[0].message.content || '{}';
    } catch (error) {
      this.logger.error(`Error extracting structured data: ${error.message}`, error.stack);
      throw new Error(`Failed to extract structured data: ${error.message}`);
    }
  }

  /**
   * Process a natural language query and convert it to a MongoDB query for property search
   * @param query The user's natural language query
   * @param isCreditQuery Whether this is a credit-related query
   * @returns A structured response with MongoDB query and explanation
   */
  async processQueryToJson(query: string, isCreditQuery = false): Promise<AiQueryResponse> {
    try {
      const systemMessage = isCreditQuery ? CREDIT_SYSTEM_MESSAGE : SYSTEM_MESSAGE;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: query }
        ],
        temperature: 0.2, // Lower temperature for more deterministic results
        response_format: { type: 'json_object' }, // Ensure response is a JSON object
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response generated');
      }

      try {
        // Parse the response as a Luna response
        const lunaResponse = JSON.parse(content) as LunaResponse;

        // Validate the response has the required fields
        if (!lunaResponse.query || !lunaResponse.message) {
          throw new Error('Response does not contain valid query or message fields');
        }

        // Validate that query is an object
        if (typeof lunaResponse.query !== 'object' || lunaResponse.query === null) {
          throw new Error('Query field must be a MongoDB query object');
        }

        // Convert Luna response to AiQueryResponse format
        return this.convertLunaResponseToAiQueryResponse(lunaResponse);
      } catch (parseError) {
        this.logger.error(`Error parsing OpenAI JSON response: ${parseError.message}`, parseError.stack);
        throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
      }
    } catch (error) {
      this.logger.error(`Error processing OpenAI query to JSON: ${error.message}`, error.stack);
      throw new Error(`Failed to process query to JSON: ${error.message}`);
    }
  }

  /**
   * Convert Luna response format to AiQueryResponse format
   * @param lunaResponse The response in Luna format
   * @returns The response in AiQueryResponse format
   */
  private convertLunaResponseToAiQueryResponse(lunaResponse: LunaResponse): AiQueryResponse {
    try {
      // The query is already a MongoDB query object, no need to parse
      const mongoQuery = lunaResponse.query;

      return {
        mongoQuery,
        explanation: lunaResponse.message,
        sort: {},
        projection: {}
      };
    } catch (error) {
      this.logger.error(`Error converting Luna response to AiQueryResponse: ${error.message}`, error.stack);
      throw new Error(`Failed to convert response format: ${error.message}`);
    }
  }
}