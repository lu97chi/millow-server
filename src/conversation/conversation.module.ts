import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { OpenAiModule } from '../openai/openai.module';
import { CreditModule } from './credit/credit.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Conversation.name, schema: ConversationSchema }]),
    forwardRef(() => OpenAiModule),
    forwardRef(() => CreditModule), 
  ],
  controllers: [ConversationController],
  providers: [ConversationService],
  exports: [ConversationService, MongooseModule], 
})
export class ConversationModule {}
