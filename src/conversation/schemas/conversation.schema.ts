import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true })
  role: 'system' | 'user' | 'assistant';

  @Prop({ required: true })
  content: string;

  @Prop({ type: Date, default: Date.now })
  timestamp: Date;
}

@Schema({ timestamps: true })
export class PropertyContext {
  @Prop()
  propertyType?: string;

  @Prop()
  bedrooms?: number;

  @Prop()
  location?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  priceRange?: {
    min?: number;
    max?: number;
  };

  @Prop({ type: [String] })
  amenities?: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  additionalPreferences?: Record<string, any>;
}

@Schema({ timestamps: true })
export class SearchContext {
  @Prop({ type: String })
  query?: string;

  @Prop({ type: String })
  location?: string;

  @Prop({ type: [String] })
  amenities?: string[];

  @Prop({ type: String })
  logicalOperator?: 'AND' | 'OR';

  @Prop({ type: MongooseSchema.Types.Mixed })
  mongoQuery?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  extractedInputs?: Record<string, any>;

  @Prop({ type: [String] })
  previousAgents?: string[];

  @Prop({ type: Date, default: Date.now })
  lastUpdated: Date;

  @Prop({ type: Boolean, default: false })
  isContinuation?: boolean;
}

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ required: true, unique: true })
  sessionId: string;

  @Prop({ type: [{ type: Message }] })
  messages: Message[];

  @Prop({ type: PropertyContext })
  context: PropertyContext;

  @Prop({ type: SearchContext })
  searchContext: SearchContext;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  mongoQuery: Record<string, any>;

  @Prop({ type: String })
  currentPropertyId?: string;

  @Prop({ type: Date, default: Date.now })
  lastUpdated: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
