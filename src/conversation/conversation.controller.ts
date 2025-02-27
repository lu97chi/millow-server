import { Controller, Post, Body, Get, Param, Delete, HttpException, HttpStatus } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('conversation')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post('session')
  async createSession() {
    try {
      const sessionId = await this.conversationService.createSession();
      return { sessionId };
    } catch (error) {
      throw new HttpException('Failed to create session', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('session/:sessionId')
  async getConversation(@Param('sessionId') sessionId: string) {
    try {
      const conversation = await this.conversationService.getConversation(sessionId);
      if (!conversation) {
        throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
      }
      return conversation;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get conversation', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('message')
  async addMessage(@Body() createMessageDto: CreateMessageDto) {
    try {
      const conversation = await this.conversationService.addMessage(createMessageDto);
      return conversation;
    } catch (error) {
      throw new HttpException('Failed to add message', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('session/:sessionId')
  async deactivateSession(@Param('sessionId') sessionId: string) {
    try {
      await this.conversationService.deactivateSession(sessionId);
      return { message: 'Session deactivated successfully' };
    } catch (error) {
      throw new HttpException('Failed to deactivate session', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
