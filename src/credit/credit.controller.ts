// credit/credit.controller.ts
import { Controller, Post, Body, Get, Param, Res, Req, HttpException, HttpStatus } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreateCreditApplicationDto, CreditEvaluationRequestDto } from './credit.dto';
import { Request, Response } from 'express';

@Controller('credit')
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  // Existing endpoints...

  @Post('apply-with-chat-session')
  async applyWithChatSession(
    @Body() createCreditDto: CreateCreditApplicationDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      // Get sessionId from cookie
      const sessionId = req.cookies['session_id'];
      
      if (!sessionId) {
        return res.status(400).json({
          message: 'No active session found. Please start a conversation first.'
        });
      }
      
      const application = await this.creditService.createApplication(
        createCreditDto,
        sessionId,
      );
      
      if (!application) {
        return res.status(500).json({
          message: 'Failed to create application'
        });
      }
      
      const applicationId = application._id.toString();
      const pdfPath = await this.creditService.generatePdf(applicationId);
      
      return res.status(201).json({
        id: applicationId,
        status: application.status,
        eligibilityScore: application.eligibilityScore,
        decisionReason: application.decisionReason,
        pdfUrl: `/chat/download-credit-report/${applicationId}`,
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Error processing credit application',
        error: error.message
      });
    }
  }
}