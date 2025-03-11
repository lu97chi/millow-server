/**
 * App Module
 *
 * Changes:
 * - Added MapsModule to the imports array
 * - Added GOOGLE_MAPS_API_KEY to the validation schema (optional)
 * - Added AgentsModule to the imports array
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { databaseConfig } from './config/database.config';
import * as Joi from 'joi';
import { PropertyModule } from './property/property.module';
import { StatsModule } from './stats/stats.module';
import { OpenAiModule } from './openai/openai.module';
import { ConversationModule } from './conversation/conversation.module';
import { MapsModule } from './maps/maps.module';
import { AgentsModule } from './agents/agents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      validationSchema: Joi.object({
        MONGODB_URI: Joi.string().required(),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        OPENAI_API_KEY: Joi.string().required(),
        GOOGLE_MAPS_API_KEY: Joi.string().optional(),
      }),
    }),
    DatabaseModule,
    PropertyModule,
    StatsModule,
    OpenAiModule,
    ConversationModule,
    MapsModule,
    AgentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
