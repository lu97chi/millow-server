export interface QueryResult<T> {
  data: T[];
  metadata: {
    executionTime: number;
    statistics: {
      totalInDatabase: number;
      matchingResults: number;
      percentageMatch: number;
      averagePrice?: number;
      priceRange?: {
        min: number;
        max: number;
      };
      citiesDistribution?: Record<string, number>;
    };
  };
}
