import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property } from '../property/schemas/property.schema';
import { MarketStats, PriceStats, SizeStats, LocationStats, PropertyTypeStats, FeaturesStats, MarketTrends } from './interfaces/market-stats.interface';

interface LocationStatsBase {
  count: number;
  percentage: number;
  averagePrice: number;
  priceRange: {
    min: number;
    max: number;
  };
}

interface StateStats extends LocationStatsBase {
  state: string;
}

interface CityStats extends LocationStatsBase {
  city: string;
  state: string;
}

interface AreaStats extends LocationStatsBase {
  area: string;
  city: string;
}

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    @InjectModel(Property.name) private propertyModel: Model<Property>
  ) {}

  async getMarketStats(): Promise<MarketStats> {
    const startTime = Date.now();
    this.logger.log('Starting market stats calculation...');

    const [
      totalProperties,
      prices,
      sizes,
      location,
      propertyTypes,
      features,
      trends,
      summary
    ] = await Promise.all([
      this.getTotalProperties(),
      this.calculatePriceStats(),
      this.calculateSizeStats(),
      this.calculateLocationStats(),
      this.calculatePropertyTypeStats(),
      this.calculateFeaturesStats(),
      this.calculateMarketTrends(),
      this.calculateMarketSummary()
    ]);

    const executionTime = Date.now() - startTime;
    this.logger.log(`Market stats calculation completed in ${executionTime}ms`);

    return {
      timestamp: new Date(),
      totalProperties,
      prices,
      sizes,
      location,
      propertyTypes,
      features,
      trends,
      summary
    };
  }

  private async getTotalProperties(): Promise<number> {
    return this.propertyModel.countDocuments();
  }

  private async calculatePriceStats(): Promise<PriceStats> {
    const [priceStats, distribution] = await Promise.all([
      this.propertyModel.aggregate([
        {
          $group: {
            _id: null,
            average: { $avg: '$price' },
            min: { $min: '$price' },
            max: { $max: '$price' }
          }
        }
      ]).exec(),
      this.propertyModel.aggregate([
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 500000, 1000000, 2000000, 3000000, 5000000, Infinity],
            default: 'Other',
            output: {
              count: { $sum: 1 },
              properties: { $push: '$_id' }
            }
          }
        }
      ]).exec()
    ]);

    const total = await this.getTotalProperties();
    const priceRanges = distribution.map(range => ({
      range: this.formatPriceRange(range._id),
      count: range.count,
      percentage: (range.count / total) * 100
    }));

    // Calculate median price
    const medianPrice = await this.calculateMedianPrice();

    return {
      average: priceStats[0]?.average || 0,
      median: medianPrice,
      min: priceStats[0]?.min || 0,
      max: priceStats[0]?.max || 0,
      distribution: priceRanges
    };
  }

  private async calculateMedianPrice(): Promise<number> {
    const prices = await this.propertyModel
      .find({}, { price: 1 })
      .sort({ price: 1 })
      .lean()
      .exec();

    const length = prices.length;
    if (length === 0) return 0;

    const midIndex = Math.floor(length / 2);
    if (length % 2 === 0) {
      return (prices[midIndex - 1].price + prices[midIndex].price) / 2;
    } else {
      return prices[midIndex].price;
    }
  }

  private async calculateSizeStats(): Promise<SizeStats> {
    const sizeStats = await this.propertyModel.aggregate([
      {
        $group: {
          _id: null,
          averageConstruction: { $avg: '$features.constructionSize' },
          averageLot: { $avg: '$features.lotSize' }
        }
      }
    ]).exec();

    const [constructionDist, lotDist] = await Promise.all([
      this.calculateSizeDistribution('constructionSize'),
      this.calculateSizeDistribution('lotSize')
    ]);

    return {
      averageConstruction: sizeStats[0]?.averageConstruction || 0,
      averageLot: sizeStats[0]?.averageLot || 0,
      constructionDistribution: constructionDist,
      lotDistribution: lotDist
    };
  }

  private async calculateSizeDistribution(field: 'constructionSize' | 'lotSize'): Promise<{ range: string; count: number; percentage: number }[]> {
    const distribution = await this.propertyModel.aggregate([
      {
        $bucket: {
          groupBy: `$features.${field}`,
          boundaries: [0, 50, 100, 150, 200, 300, 500, Infinity],
          default: 'Other',
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ]).exec();

    const total = await this.getTotalProperties();
    return distribution.map(range => ({
      range: this.formatSizeRange(range._id),
      count: range.count,
      percentage: (range.count / total) * 100
    }));
  }

  private async calculateLocationStats(): Promise<LocationStats> {
    const [byState, byCity, byArea] = await Promise.all([
      this.calculateLocationBreakdown('state'),
      this.calculateLocationBreakdown('city'),
      this.calculateLocationBreakdown('area')
    ]);

    return { byState, byCity, byArea };
  }

  private async calculateLocationBreakdown(
    level: 'state'
  ): Promise<StateStats[]>;
  private async calculateLocationBreakdown(
    level: 'city'
  ): Promise<CityStats[]>;
  private async calculateLocationBreakdown(
    level: 'area'
  ): Promise<AreaStats[]>;
  private async calculateLocationBreakdown(
    level: 'state' | 'city' | 'area'
  ): Promise<StateStats[] | CityStats[] | AreaStats[]> {
    type PipelineStage = {
      $group: {
        _id: {
          state: string;
          city: string;
          area: string;
        };
        count: { $sum: number };
        averagePrice: { $avg: string };
        minPrice: { $min: string };
        maxPrice: { $max: string };
      };
    } | {
      $sort: {
        [key: string]: 1 | -1;
      };
    };

    const pipeline: PipelineStage[] = [
      {
        $group: {
          _id: {
            state: '$location.state',
            city: '$location.city',
            area: '$location.area'
          },
          count: { $sum: 1 },
          averagePrice: { $avg: '$price' },
          minPrice: { $min: '$price' },
          maxPrice: { $max: '$price' }
        }
      },
      { 
        $sort: { 
          'count': -1
        } 
      }
    ];

    const stats = await this.propertyModel.aggregate(pipeline).exec();
    const total = await this.getTotalProperties();

    if (level === 'state') {
      // Group by state
      const stateStats = new Map<string, {
        count: number;
        totalPrice: number;
        minPrice: number;
        maxPrice: number;
      }>();

      stats.forEach(stat => {
        const state = stat._id.state as string;
        if (!stateStats.has(state)) {
          stateStats.set(state, {
            count: 0,
            totalPrice: 0,
            minPrice: Infinity,
            maxPrice: -Infinity
          });
        }
        const current = stateStats.get(state)!;
        current.count += stat.count;
        current.totalPrice += stat.averagePrice * stat.count;
        current.minPrice = Math.min(current.minPrice, stat.minPrice);
        current.maxPrice = Math.max(current.maxPrice, stat.maxPrice);
      });

      return Array.from(stateStats.entries()).map(([state, data]): StateStats => ({
        state,
        count: data.count,
        percentage: (data.count / total) * 100,
        averagePrice: data.totalPrice / data.count,
        priceRange: {
          min: data.minPrice,
          max: data.maxPrice
        }
      }));
    } else if (level === 'city') {
      // Group by city
      const cityStats = new Map<string, {
        city: string;
        state: string;
        count: number;
        totalPrice: number;
        minPrice: number;
        maxPrice: number;
      }>();

      stats.forEach(stat => {
        const key = `${stat._id.city}-${stat._id.state}`;
        if (!cityStats.has(key)) {
          cityStats.set(key, {
            city: stat._id.city,
            state: stat._id.state,
            count: 0,
            totalPrice: 0,
            minPrice: Infinity,
            maxPrice: -Infinity
          });
        }
        const current = cityStats.get(key)!;
        current.count += stat.count;
        current.totalPrice += stat.averagePrice * stat.count;
        current.minPrice = Math.min(current.minPrice, stat.minPrice);
        current.maxPrice = Math.max(current.maxPrice, stat.maxPrice);
      });

      return Array.from(cityStats.values()).map((data): CityStats => ({
        city: data.city,
        state: data.state,
        count: data.count,
        percentage: (data.count / total) * 100,
        averagePrice: data.totalPrice / data.count,
        priceRange: {
          min: data.minPrice,
          max: data.maxPrice
        }
      }));
    } else {
      // Group by area
      return stats.map((stat): AreaStats => ({
        area: stat._id.area as string,
        city: stat._id.city as string,
        count: stat.count,
        percentage: (stat.count / total) * 100,
        averagePrice: stat.averagePrice,
        priceRange: {
          min: stat.minPrice,
          max: stat.maxPrice
        }
      }));
    }
  }

  private async calculatePropertyTypeStats(): Promise<PropertyTypeStats> {
    const [distribution, byOperationType] = await Promise.all([
      this.calculateTypeDistribution(),
      this.calculateOperationTypeDistribution()
    ]);

    return { distribution, byOperationType };
  }

  private async calculateTypeDistribution() {
    const stats = await this.propertyModel.aggregate([
      {
        $group: {
          _id: '$propertyType',
          count: { $sum: 1 },
          averagePrice: { $avg: '$price' }
        }
      }
    ]).exec();

    const total = await this.getTotalProperties();
    return stats.map(stat => ({
      type: stat._id,
      count: stat.count,
      percentage: (stat.count / total) * 100,
      averagePrice: stat.averagePrice
    }));
  }

  private async calculateOperationTypeDistribution() {
    const stats = await this.propertyModel.aggregate([
      {
        $group: {
          _id: {
            operation: '$operationType',
            type: '$propertyType'
          },
          count: { $sum: 1 },
          averagePrice: { $avg: '$price' }
        }
      }
    ]).exec();

    const total = await this.getTotalProperties();
    const grouped = this.groupByOperationType(stats, total);
    return grouped;
  }

  private async calculateFeaturesStats(): Promise<FeaturesStats> {
    const [bedroomStats, bathroomStats, parkingStats, amenityStats] = await Promise.all([
      this.calculateFeatureDistribution('bedrooms'),
      this.calculateFeatureDistribution('bathrooms'),
      this.calculateFeatureDistribution('parking'),
      this.calculateAmenityStats()
    ]);

    return {
      bedrooms: bedroomStats,
      bathrooms: bathroomStats,
      parking: parkingStats,
      amenities: amenityStats
    };
  }

  private async calculateFeatureDistribution(feature: 'bedrooms' | 'bathrooms' | 'parking') {
    const stats = await this.propertyModel.aggregate([
      {
        $group: {
          _id: `$features.${feature}`,
          count: { $sum: 1 },
          average: { $avg: `$features.${feature}` }
        }
      },
      { $sort: { _id: 1 } }
    ]).exec();

    const total = await this.getTotalProperties();
    const distribution = stats.map(stat => ({
      count: stat._id,
      properties: stat.count,
      percentage: (stat.count / total) * 100
    }));

    const average = stats.reduce((acc, curr) => 
      acc + (curr._id * curr.count), 0) / total;

    return {
      average,
      distribution
    };
  }

  private async calculateAmenityStats() {
    const stats = await this.propertyModel.aggregate([
      { $unwind: '$amenities' },
      {
        $group: {
          _id: '$amenities',
          count: { $sum: 1 },
          averagePrice: { $avg: '$price' }
        }
      },
      { $sort: { count: -1 } }
    ]).exec();

    const total = await this.getTotalProperties();
    return stats.map(stat => ({
      name: stat._id,
      count: stat.count,
      percentage: (stat.count / total) * 100,
      averagePrice: stat.averagePrice
    }));
  }

  private async calculateMarketTrends(): Promise<MarketTrends> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [priceEvolution, propertyTypeTrends, locationTrends] = await Promise.all([
      this.calculatePriceEvolution(thirtyDaysAgo),
      this.calculatePropertyTypeTrends(thirtyDaysAgo),
      this.calculateLocationTrends(thirtyDaysAgo)
    ]);

    return {
      priceEvolution,
      propertyTypeTrends,
      locationTrends
    };
  }

  private async calculatePriceEvolution(startDate: Date) {
    return this.propertyModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          averagePrice: { $avg: '$price' },
          medianPrice: { $avg: '$price' },
          totalProperties: { $sum: 1 },
          newListings: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]).exec();
  }

  private async calculatePropertyTypeTrends(startDate: Date) {
    return this.propertyModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
            type: '$propertyType'
          },
          averagePrice: { $avg: '$price' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]).exec();
  }

  private async calculateLocationTrends(startDate: Date) {
    return this.propertyModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
            location: '$location.city'
          },
          averagePrice: { $avg: '$price' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]).exec();
  }

  private async calculateMarketSummary() {
    const [
      mostExpensiveAreas,
      mostActiveAreas,
      popularAmenities,
      marketHealth
    ] = await Promise.all([
      this.getMostExpensiveAreas(),
      this.getMostActiveAreas(),
      this.getPopularAmenities(),
      this.getMarketHealth()
    ]);

    return {
      mostExpensiveAreas,
      mostActiveAreas,
      popularAmenities,
      marketHealth
    };
  }

  private async getMostExpensiveAreas(limit: number = 10) {
    return this.propertyModel.aggregate([
      {
        $group: {
          _id: {
            area: '$location.area',
            city: '$location.city'
          },
          averagePrice: { $avg: '$price' },
          propertyCount: { $sum: 1 }
        }
      },
      {
        $match: {
          propertyCount: { $gte: 5 } // Minimum number of properties to be considered
        }
      },
      {
        $project: {
          _id: 0,
          area: '$_id.area',
          city: '$_id.city',
          averagePrice: 1,
          propertyCount: 1
        }
      },
      { $sort: { averagePrice: -1 } },
      { $limit: limit }
    ]).exec();
  }

  private async getMostActiveAreas(limit: number = 10) {
    const total = await this.getTotalProperties();
    const areas = await this.propertyModel.aggregate([
      {
        $group: {
          _id: {
            area: '$location.area',
            city: '$location.city'
          },
          propertyCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          area: '$_id.area',
          city: '$_id.city',
          propertyCount: 1,
          percentageOfTotal: {
            $multiply: [{ $divide: ['$propertyCount', total] }, 100]
          }
        }
      },
      { $sort: { propertyCount: -1 } },
      { $limit: limit }
    ]).exec();

    return areas;
  }

  private async getPopularAmenities(limit: number = 10) {
    const total = await this.getTotalProperties();
    return this.propertyModel.aggregate([
      { $unwind: '$amenities' },
      {
        $group: {
          _id: '$amenities',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          name: '$_id',
          count: 1,
          percentageOfProperties: {
            $multiply: [{ $divide: ['$count', total] }, 100]
          }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]).exec();
  }

  private async getMarketHealth() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalListings, newListings, avgDaysOnMarket, priceDrops] = await Promise.all([
      this.getTotalProperties(),
      this.propertyModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      this.calculateAverageDaysOnMarket(),
      this.calculatePriceDropRate(thirtyDaysAgo)
    ]);

    return {
      totalListings,
      newListingsLast30Days: newListings,
      averageDaysOnMarket: avgDaysOnMarket,
      priceDropRate: priceDrops
    };
  }

  private async calculateAverageDaysOnMarket(): Promise<number> {
    const result = await this.propertyModel.aggregate([
      {
        $project: {
          daysOnMarket: {
            $divide: [
              { $subtract: [new Date(), '$createdAt'] },
              1000 * 60 * 60 * 24 // Convert milliseconds to days
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          averageDays: { $avg: '$daysOnMarket' }
        }
      }
    ]).exec();

    return result[0]?.averageDays || 0;
  }

  private async calculatePriceDropRate(since: Date): Promise<number> {
    const result = await this.propertyModel.aggregate([
      {
        $match: {
          updatedAt: { $gte: since },
          'priceHistory.1': { $exists: true } // At least one price change
        }
      },
      {
        $project: {
          hasDropped: {
            $cond: {
              if: {
                $lt: [
                  '$price',
                  { $arrayElemAt: ['$priceHistory.price', 0] }
                ]
              },
              then: 1,
              else: 0
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalWithHistory: { $sum: 1 },
          totalDropped: { $sum: '$hasDropped' }
        }
      },
      {
        $project: {
          dropRate: {
            $multiply: [
              { $divide: ['$totalDropped', '$totalWithHistory'] },
              100
            ]
          }
        }
      }
    ]).exec();

    return result[0]?.dropRate || 0;
  }

  private formatPriceRange(value: number | 'Other'): string {
    if (value === 'Other') return 'Other';
    if (value === 0) return '< 500k';
    if (value === Infinity) return '5M+';
    return `${value / 1000000}M - ${value * 2 / 1000000}M`;
  }

  private formatSizeRange(value: number | 'Other'): string {
    if (value === 'Other') return 'Other';
    if (value === 0) return '< 50m²';
    if (value === Infinity) return '500m²+';
    return `${value}m² - ${value * 2}m²`;
  }

  private groupByOperationType(stats: any[], total: number) {
    const operationTypes = new Map();

    for (const stat of stats) {
      const { operation, type } = stat._id;
      if (!operationTypes.has(operation)) {
        operationTypes.set(operation, {
          operation,
          count: 0,
          percentage: 0,
          averagePrice: 0,
          types: []
        });
      }

      const opType = operationTypes.get(operation);
      opType.count += stat.count;
      opType.types.push({
        type,
        count: stat.count,
        percentage: (stat.count / total) * 100,
        averagePrice: stat.averagePrice
      });
    }

    // Calculate operation type percentages and average prices
    for (const [_, value] of operationTypes) {
      value.percentage = (value.count / total) * 100;
      value.averagePrice = value.types.reduce((acc, type) => 
        acc + (type.averagePrice * type.count), 0) / value.count;
    }

    return Array.from(operationTypes.values());
  }
} 