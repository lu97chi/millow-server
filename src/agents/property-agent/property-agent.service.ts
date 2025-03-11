/**
 * Property Agent Service
 *
 * Changes:
 * - Created the property agent service
 * - Implemented the Agent interface
 * - Added methods to handle queries about specific properties
 * - Added forwardRef() to break circular dependency with OpenAiService
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { OpenAiService } from '../../openai/openai.service';
import { PropertyService } from '../../property/property.service';
import { Agent, AgentInput, AgentOutput } from '../interfaces/agent.interface';
import {
  PROPERTY_DETAILS,
  formatPropertyDetails,
} from '../../openai/system-messages/propert-agent';

@Injectable()
export class PropertyAgentService implements Agent {
  private readonly logger = new Logger(PropertyAgentService.name);

  name = 'PropertyAgent';
  description = 'Handles queries about specific properties';
  requiredInputs = ['propertyId'];

  constructor(
    @Inject(forwardRef(() => OpenAiService))
    private readonly openAiService: OpenAiService,
    private readonly propertyService: PropertyService,
  ) {}

  async canHandle(input: AgentInput): Promise<boolean> {
    // Can handle queries about specific properties
    return input.additionalContext?.propertyId !== undefined;
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    try {
      const propertyId = input.additionalContext?.propertyId;

      // Check if we have the required property ID
      if (!propertyId) {
        return {
          response: 'Necesito saber de qué propiedad estás hablando.',
          missingInputs: ['propertyId'],
        };
      }

      // Get the property details
      const property = await this.propertyService.findOne(propertyId);

      if (!property) {
        return {
          response: 'No pude encontrar esa propiedad.',
          data: { error: 'Property not found' },
        };
      }

      // Format the property details
      const propertyDetails = formatPropertyDetails(property);

      // Use OpenAI to generate a response
      const messages = [
        { role: 'system' as const, content: PROPERTY_DETAILS(propertyDetails) },
        ...input.conversationHistory,
        { role: 'user' as const, content: input.query },
      ];

      const response = await this.openAiService.processConversation(messages);

      return {
        response,
        data: {
          property,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error processing with property agent: ${error.message}`,
        error.stack,
      );
      return {
        response:
          'Lo siento, tuve un problema procesando tu solicitud sobre esta propiedad.',
        data: { error: error.message },
      };
    }
  }
}
