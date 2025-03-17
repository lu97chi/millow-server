import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { BufferMemory } from 'langchain/memory';
import { ConversationChain } from 'langchain/chains';
// Import Message type correctly
import { Conversation, ConversationDocument, Message } from './langchainChatConversation.schema';
import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';

// Define interfaces for return types
interface ChatResponse {
  response: string;
  sessionId: string;  // Changed from conversationId to sessionId
}

interface ChainResponse {
  response: string;
  [key: string]: any;
}

@Injectable()
export class LangchainChatService {
  private model: ChatOpenAI;
  private systemMessage: SystemMessage
  
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
  ) {
    this.model = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.5,
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.systemMessage = new SystemMessage(
      "You are a helpful assistant that provides concise, " +
      "direct answers about real-estate credit. Keep responses under 3 sentences when possible. " + 
      "Focus only on the most important information. Avoid explanations unless specifically requested. " +
      "Use conversational language and respond like a human expert would in a quick text exchange.."
    );
  }


  async simpleChat(message: string): Promise<string> {
    // For newer version of langchain
    const response = await this.model.invoke(message);
    return response.content.toString();
  }

  async contextAwareChat(
    message: string,
    sessionId?: string,  // Changed from conversationId to sessionId
  ): Promise<ChatResponse> {
    // If no sessionId provided, create a new conversation
    if (!sessionId) {
      sessionId = uuidv4();
      // We need to await this and make sure a conversation exists
      await this.createNewConversation(sessionId);
    }

    // Retrieve conversation history or create if it doesn't exist
    const conversation = await this.conversationModel.findOne({ 
      sessionId  // Changed from conversationId to sessionId
    }).exec();

    // TypeScript knows conversation can be null here
    if (!conversation) {
      // Create a new conversation and immediately use it
      const newConversation = await this.createNewConversation(sessionId);
      
      // Add user message to conversation history
      newConversation.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
      });
      
      // Create conversation memory from history
      const memory = this.createMemoryFromHistory(newConversation.messages);

      // Run the chain
      const chain = new ConversationChain({
        llm: this.model,
        memory,
        prompt: ChatPromptTemplate.fromMessages([
          this.systemMessage,
          new MessagesPlaceholder("history"),
          ["human", "{input}"]
        ])
      });

      // Make sure this matches the LangChain version you're using
      const result = await chain.call({ input: message }) as ChainResponse;
      const response = result.response;

      // Add AI response to conversation history
      newConversation.messages.push({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      });
      
      // Update timestamp
      newConversation.updatedAt = new Date();
      
      // Save updated conversation
      await newConversation.save();

      return { response, sessionId };  // Changed from conversationId to sessionId
    } else {
      // We have an existing conversation to work with
      // Add user message to existing conversation history
      conversation.messages.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
      });
      
      // Create conversation memory from history
      const memory = this.createMemoryFromHistory(conversation.messages);

      // Run the chain
      const chain = new ConversationChain({
        llm: this.model,
        memory,
      });

      // Make sure this matches the LangChain version you're using
      const result = await chain.call({ input: message }) as ChainResponse;
      const response = result.response;

      // Add AI response to conversation history
      conversation.messages.push({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      });
      
      // Update timestamp
      conversation.updatedAt = new Date();
      
      // Save updated conversation
      await conversation.save();

      return { response, sessionId };  // Changed from conversationId to sessionId
    }
  }

  async getConversation(sessionId: string): Promise<Conversation | null> {  // Changed from conversationId to sessionId
    return this.conversationModel.findOne({ sessionId }).exec();  // Changed from conversationId to sessionId
  }

  async getAllConversations(): Promise<Conversation[]> {
    return this.conversationModel.find().sort({ updatedAt: -1 }).exec();
  }

  private async createNewConversation(sessionId: string): Promise<ConversationDocument> {  // Changed from conversationId to sessionId
    const newConversation = new this.conversationModel({
      sessionId,  // Changed from conversationId to sessionId
      messages: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    return await newConversation.save();
  }

  private createMemoryFromHistory(messages: Message[]): BufferMemory {
    const memory = new BufferMemory();
    
    // Process message pairs (user -> assistant)
    for (let i = 0; i < messages.length - 1; i += 2) {
      if (i + 1 < messages.length) {
        const userMessage = messages[i];
        const assistantMessage = messages[i + 1];
        
        if (userMessage.role === 'user' && assistantMessage.role === 'assistant') {
          memory.chatHistory.addUserMessage(userMessage.content);
          memory.chatHistory.addAIChatMessage(assistantMessage.content);
        }
      }
    }
    
    // If the last message is from a user (no response yet), add it
    if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
      memory.chatHistory.addUserMessage(messages[messages.length - 1].content);
    }
    
    return memory;
  }
}