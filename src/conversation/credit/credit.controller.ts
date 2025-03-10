import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
  Logger,
  UsePipes,
  ValidationPipe,
  HttpCode
} from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditDTO, CreditQueryDto } from './dto/credit.dto';
import { ConversationService } from '../conversation.service';
import { EligibilityResult } from '../schemas/conversation.schema';

interface CreditQueryResponse {
  sessionId: string;
  response: string;
  eligibilityResult?: EligibilityResult;
}

@Controller('credit')
export class CreditController {
  private readonly logger = new Logger(CreditController.name);

  constructor(
    private readonly creditService: CreditService,
    @Inject(forwardRef(() => ConversationService))
    private readonly conversationService: ConversationService,
  ) {}

  @Post('eligibility')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true }))
  async checkEligibility(@Body() creditDto: CreditDTO): Promise<{ sessionId: string; eligibilityResult: EligibilityResult }> {
    const sessionId = await this.conversationService.createSession();
    await this.conversationService.createConversation(sessionId);

    const eligibilityResult = await this.creditService.calculateEligibility(creditDto);

    // Store eligibility result and credit context immediately
    await this.conversationService.updateCreditContext(sessionId, creditDto, eligibilityResult);

    return { sessionId, eligibilityResult };
  }

  @Post('credit-query')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true }))
  async processCreditQuery(@Body() creditQueryDto: CreditQueryDto): Promise<any> {
    const { message, creditData, sessionId: providedSessionId } = creditQueryDto;

    let sessionId = providedSessionId || await this.conversationService.createSession();

    let conversation = await this.conversationService.getConversation(sessionId);
    if (!conversation) {
      conversation = await this.conversationService.createConversation(sessionId);
    }

    let eligibilityResult: EligibilityResult | undefined;

    if (creditData) {
      eligibilityResult = await this.creditService.calculateEligibility(creditData);
      await this.conversationService.updateCreditContext(sessionId, creditData, eligibilityResult);
    }

    await this.conversationService.addMessage({ sessionId, content: message, role: 'user' });

    const response = await this.conversationService.processConversation(sessionId);

    return { sessionId, response, eligibilityResult };
  }
}
