/**
 * Response Agent Module
 *
 * Changes:
 * - Created the response agent module
 * - Added forwardRef() to break circular dependency with OpenAiModule
 */
import { Module, forwardRef } from '@nestjs/common';
import { ResponseAgentService } from './response-agent.service';
import { OpenAiModule } from '../../openai/openai.module';

@Module({
  imports: [forwardRef(() => OpenAiModule)],
  providers: [ResponseAgentService],
  exports: [ResponseAgentService],
})
export class ResponseAgentModule {}
