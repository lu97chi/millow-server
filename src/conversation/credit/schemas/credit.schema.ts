import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { EmploymentStatus, MaritalStatus } from '../dto/credit.dto';



@Schema()
class ContactInformation {
  @Prop({ required: true, type: String })
  address: string;

  @Prop({ required: true, type: String })
  phone_number: string;

  @Prop({ required: true, type: String })
  email: string;
}

// Define the Existing Debts Schema
@Schema()
class ExistingDebt {
  @Prop({ required: true, type: String })
  debt_type: string;

  @Prop({ required: true, type: Number })
  amount: number;

  @Prop({ required: true, type: Number })
  interest_rate: number;

  @Prop({ required: true, type: Number })
  monthly_payment: number;
}

// Define the Credit Schema
export type CreditDocument = Credit & Document;

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
export class Credit {
  @Prop({ required: true, type: String })
  full_name: string;

  @Prop({ required: true, type: Date })
  birthdate: Date;

  @Prop({ required: true, type: String })
  nationality: string;

  @Prop({ required: true, type: String, enum: Object.values(MaritalStatus) })
  marital_status: MaritalStatus;

  @Prop({required:true, type:String})
  income:string;

  @Prop({ required: true, type: Number })
  number_of_dependants: number;

  @Prop({ required: true, type: ContactInformation })
  contact_information: ContactInformation;

  @Prop({ type: String })
  curp?: string;

  @Prop({ required: true, type: String, enum: Object.values(EmploymentStatus) })
  employmentStatus: EmploymentStatus;

  @Prop({ required: true, type: Number })
  credit_score: number;

  @Prop({ required: true, type: [ExistingDebt] })
  existing_debts: ExistingDebt[];
}

export const CreditSchema = SchemaFactory.createForClass(Credit);
