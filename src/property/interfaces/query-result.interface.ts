export interface QueryResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  metadata: {
    executionTime: number;
    query: any;
    sort?: Record<string, 1 | -1>;
    projection?: Record<string, 1 | 0>;
    statistics: {
      totalInDatabase: number;
      matchingResults: number;
      percentageMatch: number;
      averagePrice?: number;
      priceRange?: {
        min: number;
        max: number;
      };
      propertyTypes?: Record<string, number>;
      operationTypes?: Record<string, number>;
      citiesDistribution?: Record<string, number>;
    };
  };
} 