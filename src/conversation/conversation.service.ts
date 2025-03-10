import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Conversation, ConversationDocument, Message, PropertyContext, CreditContext, EligibilityResult } from './schemas/conversation.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { OpenAiService } from '../openai/openai.service';
import { CreditDTO } from './credit/dto/credit.dto';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly MAX_MESSAGES_PER_CONVERSATION = Infinity; // Define max messages to keep
  private readonly MAX_CONTEXT_WINDOW = Infinity; // Define max messages to send to AI

  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    private openaiService: OpenAiService,
  ) { }

  async createSession(): Promise<string> {
    const sessionId = uuidv4();
    return sessionId;
  }

  async createConversation(sessionId: string): Promise<ConversationDocument> {;

    return this.conversationModel.create({
      sessionId,
      messages: [],
      conversationType: 'property', // Default type
      context: {
        propertyType: undefined,
        bedrooms: undefined,
        location: undefined,
        priceRange: undefined,
        amenities: undefined,
        additionalPreferences: undefined
      } as PropertyContext,
      creditContext: {
        full_name: undefined,
        birthdate: undefined,
        nationality: undefined,
        marital_status: undefined,
        address: undefined,
        income: undefined,
        number_of_dependants: undefined,
        credit_score: undefined,
        employment_status: undefined,
        existing_debts: undefined,
        email: undefined,
        phone_number: undefined,
      } as CreditContext,
      isActive: true,
      lastUpdated: new Date(),
      conversationSummary: '', // New field to store conversation summaries
    });
  }
  async updateCreditContext(sessionId: string, creditData: CreditDTO, eligibilityResult: EligibilityResult): Promise<void> {
    const conversation = await this.getConversation(sessionId);
    if (!conversation) throw new Error(`Conversation not found for sessionId ${sessionId}`);
  
    conversation.conversationType = 'credit';
    conversation.creditContext = { ...conversation.creditContext, ...creditData };
  
    const creditSystemMessage = this.createCreditContextMessage(creditData, eligibilityResult);
  
    const existingIndex = conversation.messages.findIndex(msg => 
      msg.role === 'system' && msg.content.includes('DETALLES DEL CRÉDITO')
    );
  
    if (existingIndex !== -1) {
      conversation.messages[existingIndex].content = creditSystemMessage;
      conversation.messages[existingIndex].timestamp = new Date();
    } else {
      conversation.messages.unshift({
        role: 'system',
        content: creditSystemMessage,
        timestamp: new Date(),
      });
    }
  
    conversation.lastUpdated = new Date();
    await conversation.save();
  }
  
  private createCreditContextMessage(creditData: CreditDTO, eligibilityResult: EligibilityResult): string {
    const debtsInfo = (creditData.existing_debts || []).map(debt => 
      `- Tipo: ${debt.debt_type}, Monto: $${debt.amount}, Mensualidad: $${debt.monthly_payment}, Tasa: ${debt.interest_rate}%`
    ).join('\n') || 'No se reportaron deudas existentes';
  
    return `
  DETALLES DEL CRÉDITO:
  
  Información proporcionada por el usuario:
  - Nombre completo: ${creditData.full_name}
  - Fecha de nacimiento: ${creditData.birthdate.toLocaleDateString()}
  - Nacionalidad: ${creditData.nationality}
  - Estado civil: ${creditData.marital_status || 'N/A'}
  - Dirección: ${creditData.address}
  - Ingresos mensuales: $${creditData.income}
  - Número de dependientes: ${creditData.number_of_dependants}
  - Puntaje crediticio: ${creditData.credit_score}
  - Situación laboral: ${creditData.employmentStatus}
  - Teléfono: ${creditData.phone_number}
  - Email: ${creditData.email}
  - CURP: ${creditData.curp || 'N/A'}
  
  DEUDAS EXISTENTES:
  ${debtsInfo}
  
  RESULTADO DE ELEGIBILIDAD:
  - Elegible: ${eligibilityResult.isEligible ? 'Sí' : 'No'}
  - Puntaje: ${eligibilityResult.score}/100
  - Razones: ${eligibilityResult.reason || 'N/A'}
  
  Por favor, continúa asistiendo al usuario con la solicitud, manteniendo y actualizando esta información persistente.
  `;
  }
 
      
  async getConversation(sessionId: string): Promise<ConversationDocument | null> {
    return this.conversationModel.findOne({ sessionId, isActive: true });
  }

  async addMessage(createMessageDto: CreateMessageDto): Promise<ConversationDocument> {
    const { sessionId, content, role = 'user' } = createMessageDto;

    // Get or create conversation
    let conversation = await this.getConversation(sessionId);
    if (!conversation) {
      this.logger.log(`Conversation not found for session ${sessionId}, creating new one`);
      conversation = await this.createConversation(sessionId);
    }

    // Add the new message
    const newMessage: Message = {
      role,
      content,
      timestamp: new Date(),
    };
    conversation.messages.push(newMessage);

    // If we exceed max messages, summarize older messages and prune
    if (conversation.messages.length > this.MAX_MESSAGES_PER_CONVERSATION) {
      await this.summarizeAndPruneConversation(conversation);
    }

    // Update conversation context based on the message if it's a user message
    if (role === 'user') {
      await this.updateContext(conversation, content);
    }

    // Only get AI response for user messages, not system messages
    if (role === 'user') {
      await this.processConversation(sessionId);
    }

    // Save and return updated conversation
    conversation.lastUpdated = new Date();
    return conversation.save();
  }

  async processConversation(sessionId: string): Promise<string> {
    const conversation = await this.getConversation(sessionId);
    if (!conversation) {
      throw new Error(`Conversation not found for session ${sessionId}`);
    }

    const aiResponse = await this.getAIResponse(conversation);

    // Add AI response to conversation
    const assistantMessage: Message = {
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date(),
    };
    conversation.messages.push(assistantMessage);

    // Save the updated conversation
    conversation.lastUpdated = new Date();
    await conversation.save();

    return aiResponse;
  }

  /**
   * Summarize older messages and keep only recent ones to prevent the conversation
   * from growing too large while maintaining context
   */
  private async summarizeAndPruneConversation(conversation: ConversationDocument): Promise<void> {
    try {
      // Extract messages to summarize (older messages)
      const messagesToSummarize = conversation.messages.slice(
        0, 
        conversation.messages.length - Math.floor(this.MAX_MESSAGES_PER_CONVERSATION / 2)
      );
      
      if (messagesToSummarize.length === 0) return;

      // Prepare messages for summarization
      const messagesContent = messagesToSummarize
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n\n');
      
      // Generate summary
      const summaryPrompt = `Summarize the following conversation concisely while retaining key information:
      
      ${messagesContent}`;
      
      const summary = await this.openaiService.extractStructuredData(summaryPrompt);
      
      // Update conversation summary
      if (!conversation.conversationSummary) {
        conversation.conversationSummary = summary;
      } else {
        conversation.conversationSummary += "\n\n" + summary;
      }
      
      // Keep only the recent messages
      conversation.messages = conversation.messages.slice(
        conversation.messages.length - Math.floor(this.MAX_MESSAGES_PER_CONVERSATION / 2)
      );
      
      // Add a system message with the summary to provide context
      const summaryMessage: Message = {
        role: 'system',
        content: `CONVERSATION_HISTORY_SUMMARY: ${summary}`,
        timestamp: new Date(),
      };
      conversation.messages.unshift(summaryMessage);
      
      this.logger.log(`Summarized and pruned conversation ${conversation.sessionId}`);
    } catch (error) {
      this.logger.error(`Error summarizing conversation: ${error.message}`, error.stack);
      // Fall back to simple pruning if summarization fails
      conversation.messages = conversation.messages.slice(-this.MAX_MESSAGES_PER_CONVERSATION);
    }
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

    if (!conversation.creditContext) {
      conversation.creditContext = {
        full_name: undefined,
        birthdate: undefined,
        nationality: undefined,
        marital_status: undefined,
        address: undefined,
        income: undefined,
        number_of_dependants: undefined,
        credit_score: undefined,
        employment_status: undefined,
        existing_debts: undefined,
        email: undefined,
        phone_number: undefined,
      } as CreditContext;
    }

    // Check if the message indicates credit-related inquiry
    if (message.toLowerCase().includes('credito') ||
        message.toLowerCase().includes('préstamo') ||
        message.toLowerCase().includes('financiamiento') ||
        (message.toLowerCase().includes('solicitar') && message.toLowerCase().includes('préstamo'))) {
      
      // Set conversation type to credit if not already
      if (conversation.conversationType !== 'credit') {
        conversation.conversationType = 'credit';
        
        // Extract credit information and update context
        const extractedInfo = await this.extractCreditInfoWithAI(message, conversation.creditContext);
        
        // Update credit context with extracted information
        conversation.creditContext = {
          ...conversation.creditContext,
          ...extractedInfo
        };
        
        // Add or update credit system message
        this.updateCreditSystemMessage(conversation);
      } else {
        // Already in credit mode, just update the credit context
        const extractedInfo = await this.extractCreditInfoWithAI(message, conversation.creditContext);
        
        // Update credit context with extracted information
        conversation.creditContext = {
          ...conversation.creditContext,
          ...extractedInfo
        };
        
        // Update system message with new context
        this.updateCreditSystemMessage(conversation);
      }
      
      // Return early to avoid property context updates
      return;
    }
    
    // If not credit-related, handle property context updates
    if (conversation.conversationType !== 'credit') {
      // Example basic context extraction (you would want to make this more sophisticated)
      if (message.toLowerCase().includes('casa')) {
        conversation.context.propertyType = 'Casas';
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
      
      // Update property system message if needed
      this.updatePropertySystemMessage(conversation);
    }
  }

  private updateCreditSystemMessage(conversation: ConversationDocument): void {
    // Create credit context string with all available information
    const creditContextStr = JSON.stringify(conversation.creditContext);
    
    // Get missing information prompt
    const missingInfoPrompt = this.getMissingCreditInfo(conversation.creditContext);
    
    // Create system message content
    const systemContent = `DETALLES DEL CREDITO: El usuario está interesado en obtener información sobre créditos.
    Contexto actual del crédito: ${creditContextStr}
    ${missingInfoPrompt}
    ${conversation.conversationSummary ? `RESUMEN DE LA CONVERSACIÓN PREVIA: ${conversation.conversationSummary}` : ''}
    Por favor, ayuda al usuario a completar su solicitud de crédito.
    Responde en Español y mantén un seguimiento de toda la información crediticia mencionada hasta ahora.`;
    
    // Find existing credit system message if it exists
    let foundExistingMessage = false;
    for (let i = 0; i < conversation.messages.length; i++) {
      if (conversation.messages[i].role === 'system' && 
          conversation.messages[i].content.includes('DETALLES DEL CREDITO')) {
        // Update existing message
        conversation.messages[i].content = systemContent;
        conversation.messages[i].timestamp = new Date();
        foundExistingMessage = true;
        break;
      }
    }
    
    // If no existing message found, add a new one
    if (!foundExistingMessage) {
      const creditSystemMessage: Message = {
        role: 'system',
        content: systemContent,
        timestamp: new Date(),
      };
      conversation.messages.push(creditSystemMessage);
    }
  }
  
  private updatePropertySystemMessage(conversation: ConversationDocument): void {
    // Only update if we have some property context data
    if (!conversation.context || 
        (conversation.context.propertyType === undefined && 
         conversation.context.bedrooms === undefined && 
         conversation.context.location === undefined)) {
      return;
    }
    
    const contextStr = JSON.stringify(conversation.context);
    const systemContent = `DETALLES DE BÚSQUEDA: El usuario está buscando propiedades con las siguientes características:
    ${contextStr}
    ${conversation.conversationSummary ? `RESUMEN DE LA CONVERSACIÓN PREVIA: ${conversation.conversationSummary}` : ''}
    Por favor, ayuda al usuario a encontrar propiedades basadas en estas preferencias y cualquier nuevo requisito que mencionen.
    Responde en Español y mantén un seguimiento de todos los requisitos de propiedad mencionados hasta ahora.`;
    
    // Find existing property system message if it exists
    let foundExistingMessage = false;
    for (let i = 0; i < conversation.messages.length; i++) {
      if (conversation.messages[i].role === 'system' && 
          conversation.messages[i].content.includes('DETALLES DE BÚSQUEDA')) {
        // Update existing message
        conversation.messages[i].content = systemContent;
        conversation.messages[i].timestamp = new Date();
        foundExistingMessage = true;
        break;
      }
    }
    
    // If no existing message found, add a new one
    if (!foundExistingMessage) {
      const propertySystemMessage: Message = {
        role: 'system',
        content: systemContent,
        timestamp: new Date(),
      };
      conversation.messages.push(propertySystemMessage);
    }
  }

  private parseDateString(dateStr: string): string {
    // Handle various date formats
    try {
      // Add date parsing logic here
      return dateStr; // Return standardized date format
    } catch {
      return dateStr;
    }
  }
  
  private getMissingCreditInfo(creditContext: CreditContext): string {
    const requiredFields = {
      'full_name': 'nombre completo',
      'birthdate': 'fecha de nacimiento',
      'nationality': 'nacionalidad',
      'marital_status': 'estado civil',
      'address': 'dirección',
      'income': 'ingresos mensuales',
      'employment_status': 'situación laboral',
      'credit_score': 'puntaje crediticio',
      'phone_number': 'número telefónico',
      'email': 'correo electrónico'
    };
    
    const missing = Object.entries(requiredFields)
      .filter(([key]) => !creditContext[key])
      .map(([_, label]) => label);
    
    return missing.length > 0 ? 
      `La siguiente información es necesaria: ${missing.join(', ')}.` : 
      'Toda la información necesaria ha sido proporcionada.';
  }

  private async extractCreditInfoWithAI(message: string, existingContext: CreditContext): Promise<Partial<CreditContext>> {
    try {
      const prompt = `Extract credit application information from this message: "${message}". 
                      Current information we have: ${JSON.stringify(existingContext)}
                      Return only the new or updated information in JSON format.`;
      
      const response = await this.openaiService.extractStructuredData(prompt);
      return JSON.parse(response) as Partial<CreditContext>;
    } catch (error) {
      this.logger.error(`Error extracting credit info with AI: ${error.message}`);
      return {};
    }
  }

  private async getAIResponse(conversation: ConversationDocument): Promise<string> {
    const messages = this.prepareMessagesForAI(conversation);

    try {
      // Call OpenAI service with full conversation context
      return await this.openaiService.processConversation(messages);
    } catch (error) {
      this.logger.error(`Error getting AI response: ${error.message}`, error.stack);
      return 'Lo siento, hubo un error al procesar tu mensaje.';
    }
  }

  private prepareMessagesForAI(conversation: ConversationDocument): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // First add system message based on conversation type
    let systemMessageAdded = false;
    
    // Find the most recent system message of the appropriate type
    let systemMessage: Message | undefined = undefined;
    
    if (conversation.conversationType === 'credit') {
      // Look for credit system message
      for (let i = conversation.messages.length - 1; i >= 0; i--) {
        if (conversation.messages[i].role === 'system' && 
            conversation.messages[i].content.includes('DETALLES DEL CREDITO')) {
          systemMessage = conversation.messages[i];
          break;
        }
      }
    } else if (conversation.currentPropertyId) {
      // Look for property detail system message
      for (let i = conversation.messages.length - 1; i >= 0; i--) {
        if (conversation.messages[i].role === 'system' && 
            conversation.messages[i].content.includes('DETALLES DE LA PROPIEDAD')) {
          systemMessage = conversation.messages[i];
          break;
        }
      }
    } else {
      // Look for property search system message
      for (let i = conversation.messages.length - 1; i >= 0; i--) {
        if (conversation.messages[i].role === 'system' && 
            conversation.messages[i].content.includes('DETALLES DE BÚSQUEDA')) {
          systemMessage = conversation.messages[i];
          break;
        }
      }
    }
    
    // Add the appropriate system message if found
    if (systemMessage) {
      messages.push({
        role: 'system',
        content: systemMessage.content
      });
      systemMessageAdded = true;
    }
    
    // Add fallback system message if no specific one was found
    if (!systemMessageAdded) {
      if (conversation.conversationType === 'credit') {
        const creditContextStr = JSON.stringify(conversation.creditContext);
        messages.push({
          role: 'system',
          content: `DETALLES DEL CREDITO: El usuario está interesado en obtener información sobre créditos.
          Contexto actual del crédito: ${creditContextStr}
          ${conversation.conversationSummary ? `RESUMEN DE LA CONVERSACIÓN PREVIA: ${conversation.conversationSummary}` : ''}
          Por favor, ayuda al usuario a completar su solicitud de crédito, recogiendo la información necesaria.
          Responde en Español y mantén un seguimiento de toda la información crediticia mencionada hasta ahora.`
        });
      } else {
        const contextStr = JSON.stringify(conversation.context);
        messages.push({
          role: 'system',
          content: `DETALLES DE BÚSQUEDA: El usuario está buscando propiedades.
          Contexto actual: ${contextStr}
          ${conversation.conversationSummary ? `RESUMEN DE LA CONVERSACIÓN PREVIA: ${conversation.conversationSummary}` : ''}
          Por favor, ayuda al usuario a encontrar propiedades basadas en estas preferencias.
          Responde en Español y mantén un seguimiento de todos los requisitos mencionados.`
        });
      }
    }

    // Add recent conversation messages, skipping system messages we already accounted for
    const recentMessages = conversation.messages
      .filter(msg => msg.role !== 'system' || msg.content.includes('CONVERSATION_HISTORY_SUMMARY'))
      .slice(-this.MAX_CONTEXT_WINDOW) // Get only enough messages to fit in the context window
      .map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }));

    messages.push(...recentMessages);

    return messages;
  }

  async deactivateSession(sessionId: string): Promise<void> {
    await this.conversationModel.updateOne(
      { sessionId },
      { isActive: false }
    );
  }

  // New method to archive and retrieve old conversations
  async archiveOldConversations(days: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    await this.conversationModel.updateMany(
      { lastUpdated: { $lt: cutoffDate }, isArchived: { $ne: true } },
      { isArchived: true }
    );
  }

  // New method to retrieve archived conversations
  async retrieveArchivedConversation(sessionId: string): Promise<ConversationDocument | null> {
    return this.conversationModel.findOne({ sessionId, isArchived: true });
  }

  // New method to create and store conversation checkpoints
  async createConversationCheckpoint(sessionId: string, checkpointName: string): Promise<void> {
    const conversation = await this.getConversation(sessionId);
    if (!conversation) {
      throw new Error(`Conversation not found for session ${sessionId}`);
    }
    
    if (!conversation.checkpoints) {
      conversation.checkpoints = [];
    }
    
    conversation.checkpoints.push({
      name: checkpointName,
      timestamp: new Date(),
      context: conversation.context,
      creditContext: conversation.creditContext,
      conversationType: conversation.conversationType,
      conversationSummary: conversation.conversationSummary,
      messageCount: conversation.messages.length
    });
    
    await conversation.save();
  }

  // New method to restore conversation from checkpoint
  async restoreConversationCheckpoint(sessionId: string, checkpointName: string): Promise<ConversationDocument | null> {
    const conversation = await this.getConversation(sessionId);
    if (!conversation || !conversation.checkpoints) {
      return null;
    }
    
    const checkpoint = conversation.checkpoints.find(cp => cp.name === checkpointName);
    if (!checkpoint) {
      return null;
    }
    
    // Restore the conversation state from the checkpoint
    conversation.context = checkpoint.context;
    conversation.creditContext = checkpoint.creditContext;
    conversation.conversationType = checkpoint.conversationType;
    conversation.conversationSummary = checkpoint.conversationSummary;
    
    // Add a system message indicating the restoration
    conversation.messages.push({
      role: 'system',
      content: `CONVERSATION_RESTORED: The conversation has been restored to checkpoint "${checkpointName}" created on ${checkpoint.timestamp.toLocaleString()}.`,
      timestamp: new Date()
    });
    
    await conversation.save();
    return conversation;
  }
}