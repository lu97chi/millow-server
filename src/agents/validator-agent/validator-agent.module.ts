/**
 * Validator Agent Module
 *
 * Changes:
 * - Created the validator agent module
 * - Imported the OpenAI module
 * - Provided and exported the ValidatorAgentService
 * - Added forwardRef() to break circular dependency
 */
import { Module, forwardRef } from '@nestjs/common';
import { ValidatorAgentService } from './validator-agent.service';
import { OpenAiModule } from '../../openai/openai.module';

@Module({
  imports: [forwardRef(() => OpenAiModule)],
  providers: [ValidatorAgentService],
  exports: [ValidatorAgentService],
})
export class ValidatorAgentModule {} 