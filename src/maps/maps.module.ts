/**
 * Maps Module
 *
 * Changes:
 * - Created Maps module to register the service and controller
 * - Imported ConfigModule for accessing environment variables
 * - Added LocationResolverService to providers
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MapsService } from './maps.service';
import { MapsController } from './maps.controller';
import { LocationResolverService } from './services/location-resolver.service';

@Module({
  imports: [ConfigModule],
  controllers: [MapsController],
  providers: [MapsService, LocationResolverService],
  exports: [MapsService, LocationResolverService],
})
export class MapsModule {}
