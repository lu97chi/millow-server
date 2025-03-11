/**
 * Conversation Service
 *
 * Changes:
 * - Updated prepareMessagesForAI to prioritize property-specific context
 * - Added support for currentPropertyId to maintain context between filtering and property-specific queries
 * - Improved message handling to ensure property details are always included when needed
 */
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  Conversation,
  ConversationDocument,
  Message,
  PropertyContext,
} from './schemas/conversation.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { OpenAiService } from '../openai/openai.service';

@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<ConversationDocument>,
    private openaiService: OpenAiService,
  ) {}

  async createSession(): Promise<string> {
    const sessionId = uuidv4();
    await this.conversationModel.create({
      sessionId,
      messages: [],
      context: {
        propertyType: undefined,
        bedrooms: undefined,
        location: undefined,
        priceRange: undefined,
        amenities: undefined,
        additionalPreferences: undefined,
      } as PropertyContext,
      searchContext: {
        query: undefined,
        location: undefined,
        amenities: undefined,
        logicalOperator: undefined,
        mongoQuery: undefined,
        extractedInputs: undefined,
        previousAgents: undefined,
        lastUpdated: new Date(),
        isContinuation: false,
      },
      isActive: true,
    });
    return sessionId;
  }

  async getConversation(
    sessionId: string,
  ): Promise<ConversationDocument | null> {
    return this.conversationModel.findOne({ sessionId, isActive: true });
  }

  async addMessage(
    createMessageDto: CreateMessageDto,
  ): Promise<ConversationDocument> {
    const { sessionId, content, role = 'user' } = createMessageDto;

    // Get or create conversation
    let conversation = await this.getConversation(sessionId);
    if (!conversation) {
      conversation = await this.conversationModel.create({
        sessionId,
        messages: [],
        context: {
          propertyType: undefined,
          bedrooms: undefined,
          location: undefined,
          priceRange: undefined,
          amenities: undefined,
          additionalPreferences: undefined,
        } as PropertyContext,
        searchContext: {
          query: undefined,
          location: undefined,
          amenities: undefined,
          logicalOperator: undefined,
          mongoQuery: undefined,
          extractedInputs: undefined,
          previousAgents: undefined,
          lastUpdated: new Date(),
          isContinuation: false,
        },
        isActive: true,
      });
    }

    // Add the new message
    const newMessage: Message = {
      role,
      content,
      timestamp: new Date(),
    };
    conversation.messages.push(newMessage);

    // Update conversation context based on the message
    await this.updateContext(conversation, content);

    // Get AI response
    const aiResponse = await this.getAIResponse(conversation);
    if (aiResponse) {
      const assistantMessage: Message = {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
      };
      conversation.messages.push(assistantMessage);
    }

    // Save and return updated conversation
    conversation.lastUpdated = new Date();
    return conversation.save();
  }

  private async updateContext(
    conversation: ConversationDocument,
    message: string,
  ): Promise<void> {
    // Initialize context if it doesn't exist
    if (!conversation.context) {
      conversation.context = {
        propertyType: undefined,
        bedrooms: undefined,
        location: undefined,
        priceRange: undefined,
        amenities: undefined,
        additionalPreferences: undefined,
      } as PropertyContext;
    }

    // Example basic context extraction (you would want to make this more sophisticated)
    if (message.toLowerCase().includes('casa')) {
      conversation.context.propertyType = 'Casas'; // Using the exact enum value from system message
    }
    if (message.match(/(\d+)\s*cuartos?/)) {
      conversation.context.bedrooms = parseInt(RegExp.$1);
    }
    // Add more context extractors based on the property schema
    if (message.toLowerCase().includes('guadalajara')) {
      if (!conversation.context.location) {
        conversation.context.location = 'Guadalajara';
      }
    }
  }

  private async getAIResponse(
    conversation: ConversationDocument,
  ): Promise<string> {
    const messages = this.prepareMessagesForAI(conversation);

    try {
      // Call OpenAI service with full conversation context
      return await this.openaiService.processConversation(messages);
    } catch (error) {
      console.error('Error getting AI response:', error);
      return 'Lo siento, hubo un error al procesar tu mensaje.';
    }
  }

  private prepareMessagesForAI(
    conversation: ConversationDocument,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [];

    // Find property-specific system messages if a currentPropertyId is set
    let propertyContextMessage: Message | undefined = undefined;
    if (conversation.currentPropertyId) {
      // Look for the most recent system message that contains property details
      for (let i = conversation.messages.length - 1; i >= 0; i--) {
        const msg = conversation.messages[i];
        if (
          msg.role === 'system' &&
          msg.content.includes('DETALLES DE LA PROPIEDAD')
        ) {
          propertyContextMessage = msg;
          break;
        }
      }
    }

    // Add property context message first if found (highest priority)
    if (propertyContextMessage) {
      messages.push({
        role: 'system',
        content: propertyContextMessage.content,
      });
    }

    // Add general context message
    if (conversation.context) {
      const contextStr = JSON.stringify(conversation.context);
      messages.push({
        role: 'system',
        content: `Current property search context: ${contextStr}
Please help the user find properties based on these preferences and any new requirements they mention.
Remember to maintain and update this context as the conversation continues.
Respond in Spanish and keep track of all property requirements mentioned so far.`,
      });
    }

    // Add recent messages (last 10 for better context)
    // Skip system messages that we've already included
    const recentMessages = conversation.messages.slice(-10).filter((msg) => {
      // Skip system messages that contain property details if we already added one
      if (
        propertyContextMessage &&
        msg.role === 'system' &&
        msg.content.includes('DETALLES DE LA PROPIEDAD')
      ) {
        return false;
      }
      return true;
    });

    messages.push(...recentMessages);

    return messages;
  }

  async deactivateSession(sessionId: string): Promise<void> {
    await this.conversationModel.updateOne({ sessionId }, { isActive: false });
  }

  /**
   * Update the search context with new information from agent decisions
   * @param sessionId The session ID
   * @param agentDecision The agent decision containing extracted inputs
   * @param mongoQuery The MongoDB query generated by the agents
   * @returns The updated conversation
   */
  async updateSearchContext(
    sessionId: string,
    agentDecision: {
      agents: string[];
      extractedInputs: Record<string, any>;
      reasoning: string;
      isContinuation?: boolean;
    },
    mongoQuery?: Record<string, any>,
  ): Promise<ConversationDocument> {
    const conversation = await this.getConversation(sessionId);
    if (!conversation) {
      throw new Error(`Conversation with sessionId ${sessionId} not found`);
    }

    // Initialize searchContext if it doesn't exist
    if (!conversation.searchContext) {
      conversation.searchContext = {
        query: undefined,
        location: undefined,
        amenities: undefined,
        logicalOperator: undefined,
        mongoQuery: undefined,
        extractedInputs: undefined,
        previousAgents: undefined,
        lastUpdated: new Date(),
        isContinuation: false,
      };
    }

    // Update the search context
    conversation.searchContext.previousAgents = agentDecision.agents;
    conversation.searchContext.isContinuation =
      agentDecision.isContinuation || false;
    conversation.searchContext.lastUpdated = new Date();

    // Update extracted inputs
    if (agentDecision.extractedInputs) {
      conversation.searchContext.extractedInputs = {
        ...conversation.searchContext.extractedInputs,
        ...agentDecision.extractedInputs,
      };

      // Update specific fields
      if (agentDecision.extractedInputs.query) {
        conversation.searchContext.query = agentDecision.extractedInputs.query;
      }

      if (agentDecision.extractedInputs.location) {
        conversation.searchContext.location =
          agentDecision.extractedInputs.location;
      }

      if (agentDecision.extractedInputs.amenities) {
        conversation.searchContext.amenities =
          agentDecision.extractedInputs.amenities;
      }

      if (agentDecision.extractedInputs.logicalOperator) {
        conversation.searchContext.logicalOperator =
          agentDecision.extractedInputs.logicalOperator;
      }
    }

    // Update MongoDB query if provided
    if (mongoQuery) {
      conversation.searchContext.mongoQuery = mongoQuery;
    }

    return conversation.save();
  }

  /**
   * Get the search context for a conversation
   * @param sessionId The session ID
   * @returns The search context
   */
  async getSearchContext(sessionId: string): Promise<any> {
    const conversation = await this.getConversation(sessionId);
    if (!conversation) {
      return null;
    }

    return conversation.searchContext || null;
  }
}
