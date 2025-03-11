/**
 * Agent Orchestrator Module
 *
 * Changes:
 * - Created the agent orchestrator module
 * - Imported the OpenAI module
 * - Provided and exported the AgentOrchestratorService
 * - Added forwardRef() to break circular dependency
 * - Added PropertyModule import for property service
 * - Added ConversationModule import for conversation service
 * - Added ValidatorAgentModule import for validator agent
 */
import { Module, forwardRef } from '@nestjs/common';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { OpenAiModule } from '../../openai/openai.module';
import { PropertyModule } from '../../property/property.module';
import { ConversationModule } from '../../conversation/conversation.module';
import { ValidatorAgentModule } from '../validator-agent/validator-agent.module';

@Module({
  imports: [
    forwardRef(() => OpenAiModule),
    forwardRef(() => PropertyModule),
    forwardRef(() => ConversationModule),
    ValidatorAgentModule,
  ],
  providers: [AgentOrchestratorService],
  exports: [AgentOrchestratorService],
})
export class AgentOrchestratorModule {}
