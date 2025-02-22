import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { databaseConfig } from './config/database.config';
import * as Joi from 'joi';
import { PropertyModule } from './property/property.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      validationSchema: Joi.object({
        MONGODB_URI: Joi.string().required(),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
      }),
    }),
    DatabaseModule,
    PropertyModule,
    StatsModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
