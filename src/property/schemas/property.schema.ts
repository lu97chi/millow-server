import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PropertyTypeName, OperationType, PropertyEntityType, PropertyStatus, Amenity } from '../interfaces/property-filters.interface';

export type PropertyDocument = Property & Document;

@Schema({ timestamps: true })
class Coordinates {
  @Prop({ required: true, type: Number })
  lat: number;

  @Prop({ required: true, type: Number })
  lng: number;
}

@Schema()
class PropertyLocation {
  @Prop({ required: true, type: String })
  state: string;

  @Prop({ required: true, type: String })
  city: string;

  @Prop({ required: true, type: String })
  area: string;

  @Prop({ required: true, type: String })
  address: string;

  @Prop({ required: true, type: Coordinates })
  coordinates: Coordinates;
}

@Schema()
class PropertyFeatures {
  @Prop({ type: Number, default: null })
  bedrooms: number;

  @Prop({ type: Number, default: null })
  bathrooms: number;

  @Prop({ type: Number, default: null })
  constructionSize: number;

  @Prop({ type: Number, default: null })
  lotSize: number;

  @Prop({ type: Number, default: null })
  parking: number;

  @Prop({ type: Number, default: null })
  floors: number;
}

@Schema()
class Agent {
  @Prop({ required: true, type: String })
  name: string;

  @Prop({ type: String })
  title: string;

  @Prop({ required: true, type: String })
  company: string;

  @Prop({ required: true, type: String })
  image: string;

  @Prop({ required: true, type: String })
  phone: string;

  @Prop({ required: true, type: String })
  email: string;

  @Prop({ type: Number })
  experience: number;

  @Prop({ type: Number })
  activeListings: number;
}

@Schema({
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_, ret) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class Property {
  @Prop({ required: true, type: String })
  title: string;

  @Prop({ required: true, type: String })
  description: string;

  @Prop({
    required: true,
    type: String,
    enum: [
      'Desarrollos verticales',
      'Casas',
      'Locales Comerciales',
      'Oficinas',
      'Edificios',
      'Casas uso de suelo',
      'Bodegas comerciales',
      'Locales en centro comercial',
      'Departamentos',
      'Casas en condominio',
      'Desarrollos horizontales',
      'Naves industriales',
      'Terrenos comerciales',
      'Terrenos'
    ]
  })
  propertyType: PropertyTypeName;

  @Prop({
    required: true,
    type: String,
    enum: ['Venta', 'Renta', 'Desarrollo']
  })
  operationType: OperationType;

  @Prop({
    required: true,
    type: String,
    enum: ['development', 'property']
  })
  type: PropertyEntityType;

  @Prop({ required: true, type: Number })
  price: number;

  @Prop({ required: true, type: PropertyLocation })
  location: PropertyLocation;

  @Prop({ required: true, type: PropertyFeatures })
  features: PropertyFeatures;

  @Prop({
    type: [String],
    enum: [
      'Alberca',
      'Circuito Cerrado',
      'Estacionamientos',
      'Gimnasio',
      'Jardín',
      'Roof Garden'
    ]
  })
  amenities: Amenity[];

  @Prop({ required: true, type: [String] })
  images: string[];

  @Prop({ type: Number })
  propertyAge: number;

  @Prop({ type: Number, default: null })
  maintenanceFee: number;

  @Prop({
    required: true,
    type: String,
    enum: ['available', 'sold', 'rented'],
    default: 'available'
  })
  status: PropertyStatus;

  @Prop({ required: true, type: Agent })
  agent: Agent;
}

export const PropertySchema = SchemaFactory.createForClass(Property);

// Add text index for search
PropertySchema.index(
  { 
    title: 'text',
    description: 'text',
    'location.address': 'text',
    'location.area': 'text',
    'location.city': 'text',
    'location.state': 'text'
  },
  {
    weights: {
      title: 10,
      description: 5,
      'location.address': 3,
      'location.area': 2,
      'location.city': 2,
      'location.state': 1
    },
    name: "PropertyTextIndex"
  }
); 