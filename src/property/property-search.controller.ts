import { Controller, Post, Body, HttpCode, UsePipes, ValidationPipe } from '@nestjs/common';
import { PropertyService } from './property.service';
import { ExecuteQueryDto } from './dto/execute-query.dto';
import { QueryResult } from './interfaces/query-result.interface';
import { Property } from './schemas/property.schema';

@Controller('property-search')
export class PropertySearchController {
  constructor(private readonly propertyService: PropertyService) {}

  @Post()
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true }))
  async executeQuery(@Body() executeQueryDto: ExecuteQueryDto): Promise<QueryResult<Property>> {
    return this.propertyService.executeQuery(executeQueryDto);
  }
} 