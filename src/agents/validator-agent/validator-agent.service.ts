/**
 * Validator Agent Service
 *
 * Changes:
 * - Created the validator agent service
 * - Implemented the Agent interface
 * - Added methods to validate user inputs before they're processed by other agents
 * - Added special handling for location arrays and other validation cases
 * - Integrated with OpenAI to generate personalized validation messages
 * - Fixed linter errors
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { OpenAiService } from '../../openai/openai.service';
import { Agent, AgentInput, AgentOutput } from '../interfaces/agent.interface';
import { VALIDATOR_AGENT_SYSTEM_MESSAGE } from '../../openai/system-messages/validator-agent';

interface ValidationResult {
  isValid: boolean;
  invalidFields: Array<{
    field: string;
    reason: string;
    value: any;
  }>;
}

@Injectable()
export class ValidatorAgentService implements Agent {
  private readonly logger = new Logger(ValidatorAgentService.name);

  name = 'ValidatorAgent';
  description = 'Validates user inputs before they are processed by other agents';
  requiredInputs = [];

  constructor(
    @Inject(forwardRef(() => OpenAiService))
    private readonly openAiService: OpenAiService,
  ) {}

  async canHandle(input: AgentInput): Promise<boolean> {
    // The validator can handle any input
    return true;
  }

  async process(input: AgentInput): Promise<AgentOutput> {
    try {
      this.logger.debug(
        `Validating input: ${JSON.stringify(input.additionalContext)}`,
      );

      // Validate the input
      const validationResult = this.validateInput(input.additionalContext || {});

      // If the input is valid, return a success response
      if (validationResult.isValid) {
        return {
          response: 'Input validation successful',
          data: {
            validatedInput: input.additionalContext,
            validationResult,
          },
        };
      }

      // If the input is invalid, generate a personalized error message
      const errorMessage = await this.generateValidationErrorMessage(
        input.query,
        validationResult.invalidFields,
      );

      return {
        response: errorMessage,
        data: {
          validationResult,
          originalInput: input.additionalContext,
        },
        missingInputs: validationResult.invalidFields.map((field) => field.field),
      };
    } catch (error) {
      this.logger.error(
        `Error validating input: ${error.message}`,
        error.stack,
      );
      return {
        response:
          'Lo siento, tuve un problema validando tu solicitud. Por favor, intenta de nuevo con más detalles.',
        data: { error: error.message },
      };
    }
  }

  /**
   * Validate the input data
   * @param data The input data to validate
   * @returns ValidationResult with validation status and any invalid fields
   */
  private validateInput(data: Record<string, any>): ValidationResult {
    const invalidFields: Array<{
      field: string;
      reason: string;
      value: any;
    }> = [];

    // Check if data exists
    if (!data) {
      return {
        isValid: false,
        invalidFields: [
          {
            field: 'input',
            reason: 'No input data provided',
            value: null,
          },
        ],
      };
    }

    // Validate location (should not be an array)
    if (data.location && Array.isArray(data.location)) {
      invalidFields.push({
        field: 'location',
        reason: 'Location should be a single string, not an array',
        value: data.location,
      });
    }

    // Validate amenities (should be an array of valid place types)
    if (data.amenities) {
      if (!Array.isArray(data.amenities)) {
        invalidFields.push({
          field: 'amenities',
          reason: 'Amenities should be an array',
          value: data.amenities,
        });
      } else if (data.amenities.length === 0) {
        invalidFields.push({
          field: 'amenities',
          reason: 'Amenities array is empty',
          value: data.amenities,
        });
      }
    }

    // Validate logical operator (should be AND or OR)
    if (
      data.logicalOperator &&
      data.logicalOperator !== 'AND' &&
      data.logicalOperator !== 'OR'
    ) {
      invalidFields.push({
        field: 'logicalOperator',
        reason: 'Logical operator should be AND or OR',
        value: data.logicalOperator,
      });
    }

    // Validate query (should not be too vague)
    if (data.query && data.query.trim().length < 10) {
      invalidFields.push({
        field: 'query',
        reason: 'Query is too vague',
        value: data.query,
      });
    }

    return {
      isValid: invalidFields.length === 0,
      invalidFields,
    };
  }

  /**
   * Generate a personalized validation error message using OpenAI
   * @param originalQuery The original user query
   * @param invalidFields The invalid fields with reasons
   * @returns A personalized error message
   */
  private async generateValidationErrorMessage(
    originalQuery: string,
    invalidFields: Array<{ field: string; reason: string; value: any }>,
  ): Promise<string> {
    try {
      const messages = [
        { role: 'system' as const, content: VALIDATOR_AGENT_SYSTEM_MESSAGE },
        {
          role: 'user' as const,
          content: `Original query: "${originalQuery}"\n\nValidation errors: ${JSON.stringify(
            invalidFields,
          )}\n\nPlease generate a personalized message asking the user to clarify their input.`,
        },
      ];

      return await this.openAiService.processConversation(messages);
    } catch (error) {
      this.logger.error(
        `Error generating validation error message: ${error.message}`,
        error.stack,
      );
      
      // Fallback to a generic error message
      const locationField = invalidFields.find(field => field.field === 'location' && Array.isArray(field.value));
      if (locationField && Array.isArray(locationField.value)) {
        return `Veo que estás interesado en propiedades en ${locationField.value.join(' y ')}. Para poder ofrecerte los mejores resultados, ¿podrías indicarme en cuál de estas ubicaciones prefieres buscar primero?`;
      }
      
      return 'Por favor, proporciona más detalles para que pueda ayudarte mejor a encontrar lo que buscas.';
    }
  }
} 