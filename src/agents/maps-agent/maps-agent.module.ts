/**
 * Maps Agent Module
 *
 * Changes:
 * - Created the maps agent module
 * - Imported the OpenAI module and Maps module
 * - Provided and exported the MapsAgentService
 * - Added forwardRef() to break circular dependency
 */
import { Module, forwardRef } from '@nestjs/common';
import { MapsAgentService } from './maps-agent.service';
import { OpenAiModule } from '../../openai/openai.module';
import { MapsModule } from '../../maps/maps.module';

@Module({
  imports: [forwardRef(() => OpenAiModule), MapsModule],
  providers: [MapsAgentService],
  exports: [MapsAgentService],
})
export class MapsAgentModule {}
