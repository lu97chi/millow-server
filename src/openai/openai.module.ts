import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAiService } from './openai.service';
import { OpenAiController } from './openai.controller';
import { ConversationModule } from '../conversation/conversation.module';
import { PropertyModule } from '../property/property.module';

@Module({
  imports: [
    ConfigModule,
    PropertyModule,
    forwardRef(() => ConversationModule)
  ],
  controllers: [OpenAiController],
  providers: [OpenAiService],
  exports: [OpenAiService],
})
export class OpenAiModule {} 