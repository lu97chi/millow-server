/**
 * Property Controller
 * 
 * Changes:
 * - Added support for retrieving similar properties when fetching a property by ID
 * - Added query parameters:
 *   - includeSimilar: Set to 'true' to include similar properties in the response
 *   - similarLimit: Optional number of similar properties to return (default: 4)
 */
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { PropertyService } from './property.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertyFilters } from './interfaces/property-filters.interface';
import { Property } from './schemas/property.schema';
import { SearchPropertiesDto } from './dto/search-properties.dto';

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
  async findOne(
    @Param('id') id: string,
    @Query('includeSimilar') includeSimilar?: string,
    @Query('similarLimit') similarLimit?: number
  ): Promise<Property | { property: Property; similarProperties: Property[] }> {
    const property = await this.propertyService.findOne(id);
    
    // If includeSimilar is true, return similar properties
    if (includeSimilar === 'true') {
      const limit = similarLimit || 4; // Default to 4 similar properties
      const similarProperties = await this.propertyService.findSimilarProperties(property, limit);
      return { property, similarProperties };
    }
    
    return property;
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

  @Post('search')
  async search(@Body() searchDto: SearchPropertiesDto) {
    return this.propertyService.searchProperties(searchDto);
  }
} 