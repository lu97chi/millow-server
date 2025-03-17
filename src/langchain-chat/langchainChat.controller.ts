// langchain-chat/langchainChat.controller.ts
import { Controller, Post, Body, Get, Param, Res, Req, Inject, forwardRef } from '@nestjs/common';
import { LangchainChatService } from './langchainChat.service';
import { BasicMessageDto } from './dtos/basic-message.dto';
import { Request, Response } from 'express';
import { CreditService } from '../credit/credit.service';

@Controller('chat')
export class LangchainChatController {
  constructor(
    private readonly langchainChatService: LangchainChatService,
    @Inject(forwardRef(() => CreditService)) private readonly creditService: CreditService,
  ) {}

  @Post("helios")
  async chat(
    @Body() messageDto: BasicMessageDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Existing code
    let sessionId = req.cookies['session_id'];
    
    const result = await this.langchainChatService.contextAwareChat(
      messageDto.message,
      sessionId,
    );
    
    res.cookie('session_id', result.sessionId, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
    
    return {
      response: result.response,
      sessionId: result.sessionId,
    };
  }

  // Existing endpoints...
  @Post('reset')
  async resetConversation(
    @Body() messageDto: BasicMessageDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Existing code
    const result = await this.langchainChatService.contextAwareChat(
      messageDto.message,
      undefined
    );
    
    res.cookie('session_id', result.sessionId, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
    
    return {
      response: result.response,
      sessionId: result.sessionId,
    };
  }

  @Get('history')
  async getCurrentConversation(@Req() req: Request) {
    const sessionId = req.cookies['session_id'];
    if (!sessionId) {
      return { error: 'No active conversation found' };
    }
    return this.langchainChatService.getConversation(sessionId);
  }

  @Get('all')
  async getAllConversations() {
    return this.langchainChatService.getAllConversations();
  }

  // Add new credit-related endpoints
  @Post('generate-credit-report')
  async generateCreditReportFromChat(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.cookies['session_id'];
    
    if (!sessionId) {
      return res.status(400).json({
        message: 'No active session found. Please start a conversation first.'
      });
    }
    
    try {
      const pdfPath = await this.creditService.processAgentConversationForCredit(sessionId);
      
      if (!pdfPath) {
        return res.status(404).json({
          message: 'No credit application found for this conversation'
        });
      }
      
      return res.download(pdfPath);
    } catch (error) {
      return res.status(500).json({
        message: 'Error generating credit report',
        error: error.message
      });
    }
  }

  @Get('download-credit-report/:id')
  async downloadCreditReport(@Param('id') id: string, @Res() res: Response) {
    try {
      const pdfPath = await this.creditService.generatePdf(id);
      return res.download(pdfPath);
    } catch (error) {
      return res.status(500).json({
        message: 'Error downloading credit report',
        error: error.message
      });
    }
  }
}