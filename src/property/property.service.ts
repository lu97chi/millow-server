/**
 * Property Service
 * 
 * Changes:
 * - Added findSimilarProperties method to find properties similar to a given property
 * - Similarity is determined by:
 *   - Same property type
 *   - Same operation type
 *   - Similar price range (±20%)
 *   - Same city (if available)
 *   - Similar number of bedrooms and bathrooms (±1)
 *   - Available status
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Property, PropertyDocument } from './schemas/property.schema';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertyFilters } from './interfaces/property-filters.interface';
import { PropertyTypeName, OperationType, Amenity } from './interfaces/property-filters.interface';
import { ExecuteQueryDto } from './dto/execute-query.dto';
import { QueryResult } from './interfaces/query-result.interface';
import { SearchPropertiesDto } from './dto/search-properties.dto';

interface PropertyLocation {
  state: string;
  city: string;
  area: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

interface PropertyFeatures {
  bedrooms: number;
  bathrooms: number;
  constructionSize: number;
  lotSize: number;
  parking: number;
  floors: number;
}

interface Agent {
  name: string;
  company: string;
  title: string;
  image: string;
  phone: string;
  email: string;
  experience: number;
  activeListings: number;
}

@Injectable()
export class PropertyService {
  private readonly logger = new Logger(PropertyService.name);

  constructor(
    @InjectModel(Property.name) private propertyModel: Model<PropertyDocument>
  ) {}

  async create(createPropertyDto: CreatePropertyDto): Promise<Property> {
    const createdProperty = new this.propertyModel(createPropertyDto);
    return createdProperty.save();
  }

  async findAll(filters: PropertyFilters = {}) {
    const query = this.buildQuery(filters);
    
    const [properties, total] = await Promise.all([
      this.propertyModel
        .find(query)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
        .exec(),
      this.propertyModel.countDocuments(query),
    ]);

    return { properties, total };
  }

  async findOne(id: string): Promise<Property> {
    const property = await this.propertyModel.findById(id).lean().exec();
    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }
    return property;
  }

  /**
   * Find similar properties based on property type, price range, location, and features
   * @param property The property to find similar properties for
   * @param limit The maximum number of similar properties to return
   * @returns Array of similar properties
   */
  async findSimilarProperties(property: Property, limit: number = 4): Promise<Property[]> {
    this.logger.log(`Finding similar properties for property with ID ${property['_id']}`);
    
    // Build query for similar properties
    const query: any = {
      // Exclude the current property
      _id: { $ne: property['_id'] },
      // Same property type
      propertyType: property.propertyType,
      // Same operation type
      operationType: property.operationType,
      // Available status
      status: 'available',
      // Similar price range (±20%)
      price: {
        $gte: property.price * 0.8,
        $lte: property.price * 1.2
      }
    };

    // Add location similarity if available
    if (property.location && property.location.city) {
      query['location.city'] = property.location.city;
    }

    // Add bedrooms similarity if available
    if (property.features && property.features.bedrooms) {
      query['features.bedrooms'] = {
        $gte: Math.max(1, property.features.bedrooms - 1),
        $lte: property.features.bedrooms + 1
      };
    }

    // Add bathrooms similarity if available
    if (property.features && property.features.bathrooms) {
      query['features.bathrooms'] = {
        $gte: Math.max(1, property.features.bathrooms - 1),
        $lte: property.features.bathrooms + 1
      };
    }

    // Find similar properties
    const similarProperties = await this.propertyModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return similarProperties;
  }

  async update(id: string, updatePropertyDto: Partial<CreatePropertyDto>): Promise<Property> {
    const updatedProperty = await this.propertyModel
      .findByIdAndUpdate(id, updatePropertyDto, { new: true })
      .lean()
      .exec();

    if (!updatedProperty) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    return updatedProperty;
  }

  async remove(id: string): Promise<void> {
    const result = await this.propertyModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }
  }

  async getHomepageData(limit: number = 8): Promise<{
    featuredProperties: Property[];
    statistics: {
      totalProperties: number;
      availableProperties: number;
      soldProperties: number;
      rentedProperties: number;
      averagePrice: number;
      priceRange: { min: number; max: number };
      propertyTypeDistribution: Record<string, number>;
      operationTypeDistribution: Record<string, number>;
      locationDistribution: {
        topCities: Record<string, number>;
        topStates: Record<string, number>;
      };
      amenitiesDistribution: Record<string, number>;
      bedroomsDistribution: Record<string, number>;
      bathroomsDistribution: Record<string, number>;
      averageConstructionSize: number;
      averageLotSize: number;
      newestProperties: number;
      updatedLastWeek: number;
    };
  }> {
    try {
      const startTime = Date.now();
      this.logger.log('Fetching homepage data...');

      // Get random featured properties (only available ones)
      const featuredPropertiesQuery = { status: 'available' };
      const featuredProperties = await this.propertyModel.aggregate([
        { $match: featuredPropertiesQuery },
        { $sample: { size: limit } }
      ]).exec();

      // Get total counts by status
      const [
        totalProperties,
        availableProperties,
        soldProperties,
        rentedProperties
      ] = await Promise.all([
        this.propertyModel.countDocuments(),
        this.propertyModel.countDocuments({ status: 'available' }),
        this.propertyModel.countDocuments({ status: 'sold' }),
        this.propertyModel.countDocuments({ status: 'rented' })
      ]);

      // Get price statistics
      const priceStats = await this.propertyModel.aggregate([
        {
          $group: {
            _id: null,
            averagePrice: { $avg: '$price' },
            minPrice: { $min: '$price' },
            maxPrice: { $max: '$price' }
          }
        }
      ]).exec();

      // Get property type distribution
      const propertyTypeStats = await this.propertyModel.aggregate([
        {
          $group: {
            _id: '$propertyType',
            count: { $sum: 1 }
          }
        }
      ]).exec();

      // Get operation type distribution
      const operationTypeStats = await this.propertyModel.aggregate([
        {
          $group: {
            _id: '$operationType',
            count: { $sum: 1 }
          }
        }
      ]).exec();

      // Get city distribution
      const cityStats = await this.propertyModel.aggregate([
        {
          $group: {
            _id: '$location.city',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).exec();

      // Get state distribution
      const stateStats = await this.propertyModel.aggregate([
        {
          $group: {
            _id: '$location.state',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]).exec();

      // Get amenities distribution
      const amenitiesStats = await this.propertyModel.aggregate([
        { $unwind: '$amenities' },
        {
          $group: {
            _id: '$amenities',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]).exec();

      // Get bedrooms distribution
      const bedroomsStats = await this.propertyModel.aggregate([
        {
          $group: {
            _id: '$features.bedrooms',
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]).exec();

      // Get bathrooms distribution
      const bathroomsStats = await this.propertyModel.aggregate([
        {
          $group: {
            _id: '$features.bathrooms',
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]).exec();

      // Get average construction and lot size
      const sizeStats = await this.propertyModel.aggregate([
        {
          $group: {
            _id: null,
            averageConstructionSize: { $avg: '$features.constructionSize' },
            averageLotSize: { $avg: '$features.lotSize' }
          }
        }
      ]).exec();

      // Get count of properties created in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const newestProperties = await this.propertyModel.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      });

      // Get count of properties updated in the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const updatedLastWeek = await this.propertyModel.countDocuments({
        updatedAt: { $gte: sevenDaysAgo }
      });

      // Format the statistics
      const propertyTypeDistribution = Object.fromEntries(
        propertyTypeStats.map(stat => [stat._id, stat.count])
      );

      const operationTypeDistribution = Object.fromEntries(
        operationTypeStats.map(stat => [stat._id, stat.count])
      );

      const topCities = Object.fromEntries(
        cityStats.map(stat => [stat._id, stat.count])
      );

      const topStates = Object.fromEntries(
        stateStats.map(stat => [stat._id, stat.count])
      );

      const amenitiesDistribution = Object.fromEntries(
        amenitiesStats.map(stat => [stat._id, stat.count])
      );

      const bedroomsDistribution = Object.fromEntries(
        bedroomsStats.map(stat => [stat._id, stat.count])
      );

      const bathroomsDistribution = Object.fromEntries(
        bathroomsStats.map(stat => [stat._id, stat.count])
      );

      const executionTime = Date.now() - startTime;
      this.logger.log(`Homepage data fetched in ${executionTime}ms`);

      return {
        featuredProperties,
        statistics: {
          totalProperties,
          availableProperties,
          soldProperties,
          rentedProperties,
          averagePrice: priceStats[0]?.averagePrice || 0,
          priceRange: priceStats[0] ? {
            min: priceStats[0].minPrice,
            max: priceStats[0].maxPrice
          } : { min: 0, max: 0 },
          propertyTypeDistribution,
          operationTypeDistribution,
          locationDistribution: {
            topCities,
            topStates
          },
          amenitiesDistribution,
          bedroomsDistribution,
          bathroomsDistribution,
          averageConstructionSize: sizeStats[0]?.averageConstructionSize || 0,
          averageLotSize: sizeStats[0]?.averageLotSize || 0,
          newestProperties,
          updatedLastWeek
        }
      };
    } catch (error) {
      this.logger.error(`Error fetching homepage data: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to fetch homepage data');
    }
  }

  async syncProperties(properties: any[]) {
    const startTime = Date.now();
    const stats = {
      processed: 0,
      updated: 0,
      created: 0,
      errors: 0
    };

    try {
      for (const rawProperty of properties) {
        try {
          stats.processed++;

          const propertyData = this.transformPropertyData(rawProperty);

          const uniqueIdentifier = {
            title: propertyData.title || '',
            'location.address': propertyData.location?.address || '',
            'agent.name': propertyData.agent?.name || ''
          };

          const result = await this.propertyModel.findOneAndUpdate(
            uniqueIdentifier,
            { 
              ...propertyData,
              updatedAt: new Date() 
            },
            { 
              upsert: true, 
              new: true,
              setDefaultsOnInsert: true
            }
          );

          if (!result._id) {
            stats.created++;
            this.logger.debug(`Created new property: ${propertyData.title}`);
          } else {
            stats.updated++;
            this.logger.debug(`Updated property: ${propertyData.title}`);
          }

        } catch (error) {
          stats.errors++;
          this.logger.error(`Error processing property: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;
      const summary = {
        ...stats,
        duration: `${duration}ms`,
        timestamp: new Date()
      };

      this.logger.log('Sync completed', summary);
      return summary;

    } catch (error) {
      this.logger.error('Sync failed', error);
      throw error;
    }
  }

  private transformPropertyData(rawProperty: any): Partial<Property> {
    const price = rawProperty.priceOperationTypes?.[0]?.prices?.[0]?.amount || 0;

    const location: PropertyLocation = {
      state: rawProperty.postingLocation?.location?.parent?.parent?.name || '',
      city: rawProperty.postingLocation?.location?.parent?.name || '',
      area: rawProperty.postingLocation?.location?.name || '',
      address: rawProperty.postingLocation?.address?.name || '',
      coordinates: {
        lat: rawProperty.postingLocation?.postingGeolocation?.geolocation?.latitude || 0,
        lng: rawProperty.postingLocation?.postingGeolocation?.geolocation?.longitude || 0
      }
    };

    const features: PropertyFeatures = {
      bedrooms: rawProperty.mainFeatures?.CFT2?.value ? Number(rawProperty.mainFeatures?.CFT2?.value) : 0,
      bathrooms: Number(rawProperty.mainFeatures?.CFT3?.value || 0) + Number(rawProperty.mainFeatures?.CFT4?.value || 0),
      constructionSize: rawProperty.mainFeatures?.CFT101?.value ? Number(rawProperty.mainFeatures?.CFT101?.value) : 0,
      lotSize: rawProperty.mainFeatures?.CFT100?.value ? Number(rawProperty.mainFeatures?.CFT100?.value) : 0,
      parking: rawProperty.mainFeatures?.CFT7?.value ? Number(rawProperty.mainFeatures?.CFT7?.value) : 0,
      floors: 1
    };

    const agent: Agent = {
      name: rawProperty.publisher?.name || 'Unknown',
      company: rawProperty.publisher?.name || 'Unknown',
      title: 'Agent',
      image: rawProperty.publisher?.urlLogo || '',
      phone: rawProperty.whatsApp || rawProperty.publisher?.mainPhone || '',
      email: 'contact@example.com',
      experience: 0,
      activeListings: 0
    };

    const amenities = (rawProperty.highlightedFeatures || []) as Amenity[];

    const propertyType = this.mapPropertyType(rawProperty.realEstateType?.name);
    const operationType = this.mapOperationType(rawProperty.priceOperationTypes?.[0]?.operationType?.name);

    return {
      title: rawProperty.title,
      description: rawProperty.descriptionNormalized || '',
      propertyType,
      operationType,
      type: rawProperty.postingType?.toLowerCase() === 'development' ? 'development' : 'property',
      price,
      location,
      features,
      amenities,
      images: rawProperty.visiblePictures?.pictures?.map(pic => pic.url730x532) || [],
      propertyAge: 0,
      maintenanceFee: 0,
      status: 'available',
      agent
    };
  }

  private mapPropertyType(type: string): PropertyTypeName {
    const typeMap: Record<string, PropertyTypeName> = {
      'Desarrollos verticales': 'Desarrollos verticales',
      'Desarrollos horizontales': 'Desarrollos horizontales',
      'Casas': 'Casas',
      'Departamentos': 'Departamentos'
    };
    return typeMap[type] || 'Casas';
  }

  private mapOperationType(type: string): OperationType {
    const typeMap: Record<string, OperationType> = {
      'Venta': 'Venta',
      'Renta': 'Renta',
      'Desarrollo': 'Desarrollo'
    };
    return typeMap[type] || 'Venta';
  }

  private buildQuery(filters: PropertyFilters): any {
    const query: any = {};

    if (filters.propertyType?.length) {
      query.propertyType = { $in: filters.propertyType };
    }

    if (filters.operationType?.length) {
      query.operationType = { $in: filters.operationType };
    }

    if (filters.type?.length) {
      query.type = { $in: filters.type };
    }

    if (filters.minPrice || filters.maxPrice) {
      query.price = {};
      if (filters.minPrice) query.price.$gte = filters.minPrice;
      if (filters.maxPrice) query.price.$lte = filters.maxPrice;
    }

    if (filters.location) {
      if (filters.location.state?.length) {
        query['location.state'] = { $in: filters.location.state };
      }
      if (filters.location.city?.length) {
        query['location.city'] = { $in: filters.location.city };
      }
      if (filters.location.area?.length) {
        query['location.area'] = { $in: filters.location.area };
      }
    }

    if (filters.features) {
      if (filters.features.bedrooms) {
        query['features.bedrooms'] = filters.features.bedrooms;
      }
      if (filters.features.bathrooms) {
        query['features.bathrooms'] = filters.features.bathrooms;
      }
      if (filters.features.constructionSize) {
        query['features.constructionSize'] = {
          $gte: filters.features.constructionSize.min,
          $lte: filters.features.constructionSize.max,
        };
      }
      if (filters.features.lotSize) {
        query['features.lotSize'] = {
          $gte: filters.features.lotSize.min,
          $lte: filters.features.lotSize.max,
        };
      }
      if (filters.features.parking) {
        query['features.parking'] = filters.features.parking;
      }
      if (filters.features.floors) {
        query['features.floors'] = filters.features.floors;
      }
    }

    if (filters.amenities?.length) {
      query.amenities = { $all: filters.amenities };
    }

    if (filters.status?.length) {
      query.status = { $in: filters.status };
    }

    if (filters.maintenanceFee) {
      query.maintenanceFee = {};
      if (filters.maintenanceFee.min) query.maintenanceFee.$gte = filters.maintenanceFee.min;
      if (filters.maintenanceFee.max) query.maintenanceFee.$lte = filters.maintenanceFee.max;
    }

    return query;
  }

  private buildSortQuery(sortBy?: string): any {
    switch (sortBy) {
      case 'price asc':
        return { price: 1 };
      case 'price desc':
        return { price: -1 };
      case 'age asc':
        return { propertyAge: 1 };
      case 'age desc':
        return { propertyAge: -1 };
      default:
        return { createdAt: -1 };
    }
  }

  async executeQuery(executeQueryDto: ExecuteQueryDto): Promise<QueryResult<Property>> {
    const startTime = Date.now();
    const { query, options = {} } = executeQueryDto;
    
    const parsedQuery = JSON.parse(query);
    await this.validateQuery(parsedQuery);
    
    if (options.projection) {
      await this.validateProjection(options.projection);
    }

    // Get total count in database for statistics
    const totalInDatabase = await this.propertyModel.countDocuments();

    // Get count of matching documents
    const matchingResults = await this.propertyModel.countDocuments(parsedQuery);

    // Calculate percentage match
    const percentageMatch = (matchingResults / totalInDatabase) * 100;

    // Get statistics based on the query
    const [priceStats, cityStats] = await Promise.all([
      // Price statistics
      this.propertyModel.aggregate([
        { $match: parsedQuery },
        {
          $group: {
            _id: null,
            averagePrice: { $avg: '$price' },
            minPrice: { $min: '$price' },
            maxPrice: { $max: '$price' }
          }
        }
      ]).exec(),

      // City distribution
      this.propertyModel.aggregate([
        { $match: parsedQuery },
        {
          $group: {
            _id: '$location.city',
            count: { $sum: 1 }
          }
        }
      ]).exec()
    ]);

    // Execute the main query with limit
    const data = await this.propertyModel
      .find(parsedQuery, options.projection)
      .sort({ ...options.sort, createdAt: -1 })
      .limit(50)
      .lean()
      .exec();

    // Format the statistics
    const citiesDistribution = Object.fromEntries(
      cityStats.map(stat => [stat._id, stat.count])
    );

    const executionTime = Date.now() - startTime;

    return {
      data,
      metadata: {
        executionTime,
        statistics: {
          totalInDatabase,
          matchingResults,
          percentageMatch,
          averagePrice: priceStats[0]?.averagePrice,
          priceRange: priceStats[0] ? {
            min: priceStats[0].minPrice,
            max: priceStats[0].maxPrice
          } : undefined,
          citiesDistribution
        }
      }
    };
  }

  private validateQuery(query: any) {
    // Add query validation rules
    const disallowedOperators = ['$where', '$expr', '$function'];
    
    const checkForDisallowedOperators = (obj: any) => {
      for (const key in obj) {
        if (disallowedOperators.includes(key)) {
          throw new BadRequestException(`Operator ${key} is not allowed`);
        }
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          checkForDisallowedOperators(obj[key]);
        }
      }
    };

    checkForDisallowedOperators(query);
  }

  private validateProjection(projection: any) {
    // Add projection validation rules
    const allowedFields = [
      'title', 'description', 'price', 'location', 
      'features', 'amenities', 'images', 'status', 
      'propertyType', 'operationType', 'agent'
    ];

    for (const field in projection) {
      if (!allowedFields.includes(field.split('.')[0])) {
        throw new BadRequestException(`Projection field ${field} is not allowed`);
      }
    }
  }

  async searchProperties(searchDto: SearchPropertiesDto) {
    const { query } = searchDto;
    const startTime = Date.now();
    
    // Create text search query
    const searchQuery = {
      $text: { $search: query }
    };

    // Get total count in database for statistics
    const totalInDatabase = await this.propertyModel.countDocuments();

    // Get count of matching documents
    const matchingResults = await this.propertyModel.countDocuments(searchQuery);

    // Execute search with scoring
    const data = await this.propertyModel
      .aggregate([
        // Add text score
        {
          $match: searchQuery
        },
        {
          $addFields: {
            score: { $meta: "textScore" }
          }
        },
        // Sort by score (descending) and creation date (newest first)
        {
          $sort: {
            score: -1,
            createdAt: -1
          }
        },
        // Limit results
        {
          $limit: 50
        }
      ])
      .exec();

    return {
      data,
      metadata: {
        executionTime: Date.now() - startTime,
        totalInDatabase,
        matchingResults,
        percentageMatch: (matchingResults / totalInDatabase) * 100
      }
    };
  }
} 