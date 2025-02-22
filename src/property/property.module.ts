import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PropertyController } from './property.controller';
import { PropertySearchController } from './property-search.controller';
import { PropertyService } from './property.service';
import { Property, PropertySchema } from './schemas/property.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Property.name, schema: PropertySchema }])
  ],
  controllers: [PropertyController, PropertySearchController],
  providers: [PropertyService],
  exports: [PropertyService],
})
export class PropertyModule {} 