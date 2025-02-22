import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PropertyService } from '../property/property.service';
import * as fs from 'fs/promises';

async function bootstrap() {
    try {
        // Create a standalone NestJS application context
        const app = await NestFactory.createApplicationContext(AppModule);
        const propertyService = app.get(PropertyService);

        console.log('Starting property sync...');

        // Read the JSON file
        const paths = [
            'src/data/scrap.compra.guadalajara.json',
            'src/data/scrap.compra.mazatlan.json',
            'src/data/scrap.compra.monterrey.json',
            'src/data/scrap.compra.tijuana.json',
            'src/data/scrap.desarrollo.guadalajara.json',
            'src/data/scrap.desarrollo.mazatlan.json',
            'src/data/scrap.desarrollo.monterrey.json',
            'src/data/scrap.desarrollo.tijuana.json',
            'src/data/scrap.renta.guadalajara.json',
            'src/data/scrap.renta.mazatlan.json',
            'src/data/scrap.renta.monterrey.json',
            'src/data/scrap.renta.tijuana.json',
            'src/data/scrap.remate.guadalajara.json',
            'src/data/scrap.remate.mazatlan.json',
            'src/data/scrap.remate.monterrey.json',
            'src/data/scrap.remate.tijuana.json',
            'src/data/scrap.vacacional.guadalajara.json',
            'src/data/scrap.vacacional.mazatlan.json',
            'src/data/scrap.vacacional.monterrey.json',
            'src/data/scrap.vacacional.tijuana.json',
        ]

        for (const jsonPath of paths) {
            const rawData = await fs.readFile(jsonPath, 'utf-8');
            const properties = JSON.parse(rawData);

            // Perform the sync
            const result = await propertyService.syncProperties(properties);

            console.log('Sync Results:', result);
        }

        // Cleanup
        await app.close();
        process.exit(0);
    } catch (error) {
        console.error('Error during sync:', error);
        process.exit(1);
    }
}

bootstrap(); 