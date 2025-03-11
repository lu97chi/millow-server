/**
 * OpenAI Module
 *
 * Changes:
 * - Added AgentsModule to imports to resolve dependency injection
 * - Added forwardRef() to break circular dependency with AgentsModule
 * - Added ResponseAgentModule to imports to resolve dependency injection
 */
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAiService } from './openai.service';
import { OpenAiController } from './openai.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { PropertyModule } from '../property/property.module';
import { AgentsModule } from '../agents/agents.module';
import { ResponseAgentModule } from '../agents/response-agent/response-agent.module';

@Module({
  imports: [
    ConfigModule,
    PropertyModule,
    forwardRef(() => ConversationModule),
    forwardRef(() => AgentsModule),
    forwardRef(() => ResponseAgentModule),
  ],
  controllers: [OpenAiController],
  providers: [OpenAiService],
  exports: [OpenAiService],
})
export class OpenAiModule {}
