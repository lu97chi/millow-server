/**
 * Property Agent Module
 *
 * Changes:
 * - Created the property agent module
 * - Imported the OpenAI module and Property module
 * - Provided and exported the PropertyAgentService
 * - Added forwardRef() to break circular dependency
 */
import { Module, forwardRef } from '@nestjs/common';
import { PropertyAgentService } from './property-agent.service';
import { OpenAiModule } from '../../openai/openai.module';
import { PropertyModule } from '../../property/property.module';

@Module({
  imports: [forwardRef(() => OpenAiModule), PropertyModule],
  providers: [PropertyAgentService],
  exports: [PropertyAgentService],
})
export class PropertyAgentModule {}
