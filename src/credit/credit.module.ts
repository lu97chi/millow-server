import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';
import { CreditApplication, CreditApplicationSchema } from './credit.schema';
import { LangchainChatModule } from 'src/langchain-chat/langchainChat.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CreditApplication.name, schema: CreditApplicationSchema },
    ]),
    forwardRef(()=> LangchainChatModule), // Import the LangchainChatModule to use its service
  ],
  controllers: [CreditController],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditModule {}