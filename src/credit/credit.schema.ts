import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CreditApplicationDocument = CreditApplication & Document;

@Schema()
export class CreditApplication {
  // _id is handled by Mongoose automatically, but we need to define it for TypeScript
  _id: Types.ObjectId;

  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop({ required: true })
  employmentStatus: string;

  @Prop({ required: true })
  income: number;

  @Prop({ required: true })
  creditScore: number;

  @Prop()
  existingDebt?: number;

  @Prop({ required: true })
  propertyValue: number;

  @Prop()
  propertyAddress?: string;

  @Prop()
  propertyType?: string;

  @Prop({ required: true })
  loanAmount: number;

  @Prop({ required: true })
  sessionId: string;

  @Prop()
  submittedAt: Date;

  @Prop()
  status: string;

  @Prop()
  eligibilityScore?: number;

  @Prop()
  decisionReason?: string;

  @Prop({ type: Object })
  additionalInfo?: Record<string, any>;
}

export const CreditApplicationSchema = SchemaFactory.createForClass(CreditApplication);