import { Controller, Post, Body, HttpCode, UsePipes, ValidationPipe, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { QueryDto } from './dto/query.dto';
import { PropertyService } from '../property/property.service';
import { ExecuteQueryDto } from '../property/dto/execute-query.dto';

@Controller('query')
export class OpenAiController {
  constructor(
    private readonly openAiService: OpenAiService,
    private readonly propertyService: PropertyService
  ) {}

  @Post()
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ transform: true }))
  async processQuery(@Body() queryDto: QueryDto): Promise<any> {
    try {
      // Step 1: Process the query with OpenAI
      const aiResponse = await this.openAiService.processQueryToJson(queryDto.query);
      
      // Step 2: Validate and transform the AI response into a property search query
      if (!aiResponse || !aiResponse.mongoQuery) {
        throw new HttpException(
          'Failed to generate a valid property search query from your request. Please try again with more specific details.',
          HttpStatus.BAD_REQUEST
        );
      }

      console.log(aiResponse, 'aiResponse')

      // Step 3: Create the ExecuteQueryDto
      const executeQueryDto: ExecuteQueryDto = {
        query: JSON.stringify(aiResponse.mongoQuery),
        page: aiResponse.page || 1,
        pageSize: aiResponse.pageSize || 50,
        options: {
          sort: aiResponse.sort,
          projection: aiResponse.projection
        }
      };

      // Step 4: Execute the property search query
      const searchResults = await this.propertyService.executeQuery(executeQueryDto);
      
      // Step 5: Return the results along with the AI's explanation
      return {
        results: searchResults,
        explanation: aiResponse.explanation || 'No explanation provided'
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        `Error processing your query: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 