import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { EmploymentStatus, MaritalStatus } from '../credit/dto/credit.dto';

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

export interface ConversationCheckpoint {
  name: string;
  timestamp: Date;
  context: PropertyContext;
  creditContext: CreditContext;
  conversationType: string;
  conversationSummary: string;
  messageCount: number;
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
export class CreditContext {
  @Prop()
  full_name?: string;

  @Prop({type:Date})
  birthdate?: Date ;

  @Prop()
  nationality?: string;

  @Prop()
  marital_status?: MaritalStatus;

  @Prop()
  number_of_dependants?: number;

  @Prop()
  address?: string;

  @Prop()
  phone_number?: string; 

  @Prop()
  credit_info?:string;

  @Prop()
  email?: string;  

  @Prop()
  curp?: string;

  @Prop()
  employmentStatus?: EmploymentStatus;  

  @Prop()
  credit_score?: number;

  @Prop({type:String})
  income?:  number;

  //@Prop({ type: [{ type: St }] })
  existing_debts:any;

}

@Schema({timestamps:true})
export class EligibilityResult {
  @Prop()
  isEligible: boolean;
  
  @Prop()
  score: number;
  
  @Prop()
  reason: string;
}

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ required: true, unique: true })
  sessionId: string;

  @Prop({ type: [{ type: Message }] })
  messages: Message[];
  
  @Prop({ type: String, enum: ['property', 'credit'], default: 'property' })
  conversationType: string;

  @Prop({ type: PropertyContext })
  context: PropertyContext;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  mongoQuery: Record<string, any>;

  @Prop({ type: String })
  currentPropertyId?: string;

  @Prop({ type: CreditContext })
  creditContext: CreditContext;

  @Prop({ type: EligibilityResult })
  eligibilityResult?: EligibilityResult;

  @Prop({ type: Date, default: Date.now })
  lastUpdated: Date;

  @Prop({ type: String, default: '' })
  conversationSummary: string;

  @Prop({ type: Array, default: [] })
  checkpoints: ConversationCheckpoint[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation); 