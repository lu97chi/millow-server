import { Test, TestingModule } from '@nestjs/testing';
import { MapsService } from './maps.service';
import { ConfigService } from '@nestjs/config';
import { LocationResolverService } from './services/location-resolver.service';
import { PlaceResult } from './interfaces/maps.interfaces';

describe('MapsService', () => {
  let service: MapsService;
  let locationResolverService: LocationResolverService;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key) => {
      if (key === 'GOOGLE_MAPS_API_KEY') {
        return 'test-api-key';
      }
      return null;
    }),
  };

  const mockLocationResolverService = {
    resolveLocation: jest.fn().mockImplementation(() => {
      return Promise.resolve({
        coordinates: { lat: 20.6597, lng: -103.3496 },
        isAccurate: true,
      });
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MapsService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: LocationResolverService,
          useValue: mockLocationResolverService,
        },
      ],
    }).compile();

    service = module.get<MapsService>(MapsService);
    locationResolverService = module.get<LocationResolverService>(
      LocationResolverService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sortAndLimitResults', () => {
    // Create a private method accessor to test the private method
    let sortAndLimitResults: (
      results: PlaceResult[],
      sortBy?: string,
      sortDesc?: boolean,
      limit?: number,
    ) => PlaceResult[];

    beforeEach(() => {
      // Access the private method using type assertion
      sortAndLimitResults = (service as any).sortAndLimitResults.bind(service);
    });

    it('should sort results by rating in descending order by default', () => {
      const mockResults: PlaceResult[] = [
        {
          id: '1',
          name: 'Place 1',
          address: 'Address 1',
          location: { lat: 1, lng: 1 },
          types: ['hospital'],
          rating: 3.5,
          userRatingsTotal: 100,
        },
        {
          id: '2',
          name: 'Place 2',
          address: 'Address 2',
          location: { lat: 2, lng: 2 },
          types: ['hospital'],
          rating: 4.5,
          userRatingsTotal: 200,
        },
        {
          id: '3',
          name: 'Place 3',
          address: 'Address 3',
          location: { lat: 3, lng: 3 },
          types: ['hospital'],
          rating: 4.0,
          userRatingsTotal: 150,
        },
      ];

      const sortedResults = sortAndLimitResults(mockResults);

      expect(sortedResults[0].id).toBe('2'); // Highest rating (4.5)
      expect(sortedResults[1].id).toBe('3'); // Second highest (4.0)
      expect(sortedResults[2].id).toBe('1'); // Lowest rating (3.5)
    });

    it('should sort results by rating in ascending order when sortDesc is false', () => {
      const mockResults: PlaceResult[] = [
        {
          id: '1',
          name: 'Place 1',
          address: 'Address 1',
          location: { lat: 1, lng: 1 },
          types: ['hospital'],
          rating: 3.5,
          userRatingsTotal: 100,
        },
        {
          id: '2',
          name: 'Place 2',
          address: 'Address 2',
          location: { lat: 2, lng: 2 },
          types: ['hospital'],
          rating: 4.5,
          userRatingsTotal: 200,
        },
        {
          id: '3',
          name: 'Place 3',
          address: 'Address 3',
          location: { lat: 3, lng: 3 },
          types: ['hospital'],
          rating: 4.0,
          userRatingsTotal: 150,
        },
      ];

      const sortedResults = sortAndLimitResults(mockResults, 'rating', false);

      expect(sortedResults[0].id).toBe('1'); // Lowest rating (3.5)
      expect(sortedResults[1].id).toBe('3'); // Second highest (4.0)
      expect(sortedResults[2].id).toBe('2'); // Highest rating (4.5)
    });

    it('should sort by number of ratings when ratings are equal', () => {
      const mockResults: PlaceResult[] = [
        {
          id: '1',
          name: 'Place 1',
          address: 'Address 1',
          location: { lat: 1, lng: 1 },
          types: ['hospital'],
          rating: 4.0,
          userRatingsTotal: 100,
        },
        {
          id: '2',
          name: 'Place 2',
          address: 'Address 2',
          location: { lat: 2, lng: 2 },
          types: ['hospital'],
          rating: 4.0,
          userRatingsTotal: 200,
        },
        {
          id: '3',
          name: 'Place 3',
          address: 'Address 3',
          location: { lat: 3, lng: 3 },
          types: ['hospital'],
          rating: 4.0,
          userRatingsTotal: 150,
        },
      ];

      const sortedResults = sortAndLimitResults(mockResults);

      expect(sortedResults[0].id).toBe('2'); // Most ratings (200)
      expect(sortedResults[1].id).toBe('3'); // Second most (150)
      expect(sortedResults[2].id).toBe('1'); // Least ratings (100)
    });

    it('should limit the number of results', () => {
      const mockResults: PlaceResult[] = [
        {
          id: '1',
          name: 'Place 1',
          address: 'Address 1',
          location: { lat: 1, lng: 1 },
          types: ['hospital'],
          rating: 3.5,
          userRatingsTotal: 100,
        },
        {
          id: '2',
          name: 'Place 2',
          address: 'Address 2',
          location: { lat: 2, lng: 2 },
          types: ['hospital'],
          rating: 4.5,
          userRatingsTotal: 200,
        },
        {
          id: '3',
          name: 'Place 3',
          address: 'Address 3',
          location: { lat: 3, lng: 3 },
          types: ['hospital'],
          rating: 4.0,
          userRatingsTotal: 150,
        },
      ];

      const sortedResults = sortAndLimitResults(mockResults, 'rating', true, 2);

      expect(sortedResults.length).toBe(2);
      expect(sortedResults[0].id).toBe('2'); // Highest rating (4.5)
      expect(sortedResults[1].id).toBe('3'); // Second highest (4.0)
    });

    it('should handle missing ratings by treating them as 0', () => {
      const mockResults: PlaceResult[] = [
        {
          id: '1',
          name: 'Place 1',
          address: 'Address 1',
          location: { lat: 1, lng: 1 },
          types: ['hospital'],
          // No rating
          userRatingsTotal: 100,
        },
        {
          id: '2',
          name: 'Place 2',
          address: 'Address 2',
          location: { lat: 2, lng: 2 },
          types: ['hospital'],
          rating: 4.5,
          userRatingsTotal: 200,
        },
        {
          id: '3',
          name: 'Place 3',
          address: 'Address 3',
          location: { lat: 3, lng: 3 },
          types: ['hospital'],
          rating: 0, // Explicit 0 rating
          userRatingsTotal: 150,
        },
      ];

      const sortedResults = sortAndLimitResults(mockResults);

      expect(sortedResults[0].id).toBe('2'); // Has rating (4.5)
      expect(sortedResults[1].id).toBe('1'); // No rating, but more user ratings
      expect(sortedResults[2].id).toBe('3'); // 0 rating
    });

    it('should sort by distance when specified', () => {
      const mockResults: PlaceResult[] = [
        {
          id: '1',
          name: 'Place 1',
          address: 'Address 1',
          location: { lat: 1, lng: 1 },
          types: ['hospital'],
          rating: 4.5,
          userRatingsTotal: 100,
          distance: 1500,
        },
        {
          id: '2',
          name: 'Place 2',
          address: 'Address 2',
          location: { lat: 2, lng: 2 },
          types: ['hospital'],
          rating: 3.5,
          userRatingsTotal: 200,
          distance: 500,
        },
        {
          id: '3',
          name: 'Place 3',
          address: 'Address 3',
          location: { lat: 3, lng: 3 },
          types: ['hospital'],
          rating: 4.0,
          userRatingsTotal: 150,
          distance: 1000,
        },
      ];

      const sortedResults = sortAndLimitResults(mockResults, 'distance', false);

      expect(sortedResults[0].id).toBe('2'); // Closest (500m)
      expect(sortedResults[1].id).toBe('3'); // Second closest (1000m)
      expect(sortedResults[2].id).toBe('1'); // Furthest (1500m)
    });
  });
});
