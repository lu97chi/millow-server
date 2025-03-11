export interface PriceStats {
  average: number;
  median: number;
  min: number;
  max: number;
  distribution: {
    range: string;
    count: number;
    percentage: number;
  }[];
}

export interface SizeStats {
  averageConstruction: number;
  averageLot: number;
  constructionDistribution: {
    range: string;
    count: number;
    percentage: number;
  }[];
  lotDistribution: {
    range: string;
    count: number;
    percentage: number;
  }[];
}

export interface LocationStats {
  byState: {
    state: string;
    count: number;
    percentage: number;
    averagePrice: number;
    priceRange: { min: number; max: number };
  }[];
  byCity: {
    city: string;
    state: string;
    count: number;
    percentage: number;
    averagePrice: number;
    priceRange: { min: number; max: number };
  }[];
}

export interface PropertyTypeStats {
  distribution: {
    type: string;
    count: number;
    percentage: number;
    averagePrice: number;
  }[];
  byOperationType: {
    operation: string;
    count: number;
    percentage: number;
    averagePrice: number;
    types: {
      type: string;
      count: number;
      percentage: number;
      averagePrice: number;
    }[];
  }[];
}

export interface FeaturesStats {
  bedrooms: {
    average: number;
    distribution: { count: number; properties: number; percentage: number }[];
  };
  bathrooms: {
    average: number;
    distribution: { count: number; properties: number; percentage: number }[];
  };
  parking: {
    average: number;
    distribution: { count: number; properties: number; percentage: number }[];
  };
  amenities: {
    name: string;
    count: number;
    percentage: number;
    averagePrice: number;
  }[];
}

export interface MarketTrends {
  priceEvolution: {
    period: string;
    averagePrice: number;
    medianPrice: number;
    totalProperties: number;
    newListings: number;
  }[];
  propertyTypeTrends: {
    period: string;
    type: string;
    averagePrice: number;
    count: number;
  }[];
  locationTrends: {
    period: string;
    location: string;
    averagePrice: number;
    count: number;
  }[];
}

export interface MarketStats {
  timestamp: Date;
  totalProperties: number;
  prices: PriceStats;
  sizes: SizeStats;
  location: LocationStats;
  propertyTypes: PropertyTypeStats;
  features: FeaturesStats;
  trends: MarketTrends;
  summary: {
    mostExpensiveAreas: {
      city: string;
      averagePrice: number;
      propertyCount: number;
    }[];
    mostActiveAreas: {
      city: string;
      propertyCount: number;
      percentageOfTotal: number;
    }[];
    popularAmenities: {
      name: string;
      count: number;
      percentageOfProperties: number;
    }[];
    marketHealth: {
      totalListings: number;
      newListingsLast30Days: number;
      averageDaysOnMarket: number;
      priceDropRate: number;
    };
  };
}
