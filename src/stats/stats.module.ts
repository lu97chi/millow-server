import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { MongooseModule } from '@nestjs/mongoose';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { Property, PropertySchema } from '../property/schemas/property.schema';

@Module({
  imports: [
    CacheModule.register({
      ttl: 3600, // Default cache TTL of 1 hour
      max: 100 // Maximum number of items in cache
    }),
    MongooseModule.forFeature([{ name: Property.name, schema: PropertySchema }])
  ],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {} 