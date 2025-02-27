import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Conversation, ConversationDocument, Message, PropertyContext } from './schemas/conversation.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { OpenAiService } from '../openai/openai.service';

@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
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
        additionalPreferences: undefined
      } as PropertyContext,
      isActive: true,
    });
    return sessionId;
  }

  async getConversation(sessionId: string): Promise<ConversationDocument | null> {
    return this.conversationModel.findOne({ sessionId, isActive: true });
  }

  async addMessage(createMessageDto: CreateMessageDto): Promise<ConversationDocument> {
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
          additionalPreferences: undefined
        } as PropertyContext,
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

  private async updateContext(conversation: ConversationDocument, message: string): Promise<void> {
    // Initialize context if it doesn't exist
    if (!conversation.context) {
      conversation.context = {
        propertyType: undefined,
        bedrooms: undefined,
        location: undefined,
        priceRange: undefined,
        amenities: undefined,
        additionalPreferences: undefined
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

  private async getAIResponse(conversation: ConversationDocument): Promise<string> {
    const messages = this.prepareMessagesForAI(conversation);
    
    try {
      // Call OpenAI service with full conversation context
      return await this.openaiService.processConversation(messages);
    } catch (error) {
      console.error('Error getting AI response:', error);
      return 'Lo siento, hubo un error al procesar tu mensaje.';
    }
  }

  private prepareMessagesForAI(conversation: ConversationDocument): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    
    // Add context message
    if (conversation.context) {
      const contextStr = JSON.stringify(conversation.context);
      messages.push({
        role: 'system',
        content: `Current property search context: ${contextStr}
Please help the user find properties based on these preferences and any new requirements they mention.
Remember to maintain and update this context as the conversation continues.
Respond in Spanish and keep track of all property requirements mentioned so far.`
      });
    }

    // Add recent messages (last 10 for better context)
    const recentMessages = conversation.messages.slice(-10);
    messages.push(...recentMessages);

    return messages;
  }

  async deactivateSession(sessionId: string): Promise<void> {
    await this.conversationModel.updateOne(
      { sessionId },
      { isActive: false }
    );
  }
}
