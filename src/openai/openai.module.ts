import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAiService } from './openai.service';
import { OpenAiController } from './openai.controller';
import { PropertyModule } from '../property/property.module';

@Module({
  imports: [
    ConfigModule,
    PropertyModule
  ],
  controllers: [OpenAiController],
  providers: [OpenAiService],
  exports: [OpenAiService],
})
export class OpenAiModule {} 