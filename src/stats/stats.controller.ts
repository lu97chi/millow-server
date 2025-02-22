import { Controller, Get } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { UseInterceptors } from '@nestjs/common';
import { StatsService } from './stats.service';
import { MarketStats } from './interfaces/market-stats.interface';

@Controller('stats')
@UseInterceptors(CacheInterceptor)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @CacheTTL(3600) // Cache for 1 hour
  async getMarketStats(): Promise<MarketStats> {
    return this.statsService.getMarketStats();
  }
} 