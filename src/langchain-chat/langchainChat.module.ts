import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LangchainChatController } from './langchainChat.controller';
import { LangchainChatService } from './langchainChat.service';
import { Conversation, ConversationSchema } from './langchainChatConversation.schema';
import { CreditModule } from 'src/credit/credit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
    ]),
    CreditModule
  ],
  controllers: [LangchainChatController],
  providers: [LangchainChatService],
  exports: [LangchainChatService],
})
export class LangchainChatModule {}