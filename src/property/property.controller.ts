import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { PropertyService } from './property.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertyFilters } from './interfaces/property-filters.interface';
import { Property } from './schemas/property.schema';

@Controller('properties')
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Post()
  async create(@Body() createPropertyDto: CreatePropertyDto): Promise<Property> {
    return this.propertyService.create(createPropertyDto);
  }

  @Get()
  async findAll(@Query() filters: PropertyFilters): Promise<{ properties: Property[]; total: number }> {
    return this.propertyService.findAll(filters);
  }

  @Get('homepage')
  async getHomepageData() {
    return this.propertyService.getHomepageData();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Property> {
    return this.propertyService.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updatePropertyDto: Partial<CreatePropertyDto>,
  ): Promise<Property> {
    return this.propertyService.update(id, updatePropertyDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.propertyService.remove(id);
  }
} 