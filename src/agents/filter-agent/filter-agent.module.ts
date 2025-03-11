/**
 * Filter Agent Module
 *
 * Changes:
 * - Created the filter agent module
 * - Imported the OpenAI module
 * - Provided and exported the FilterAgentService
 * - Added forwardRef() to break circular dependency
 */
import { Module, forwardRef } from '@nestjs/common';
import { FilterAgentService } from './filter-agent.service';
import { OpenAiModule } from '../../openai/openai.module';

@Module({
  imports: [forwardRef(() => OpenAiModule)],
  providers: [FilterAgentService],
  exports: [FilterAgentService],
})
export class FilterAgentModule {}
