import { EmploymentStatus, MaritalStatus } from "../dto/credit.dto";

export interface CreditInterface {

    // Personal Info
    full_name: string;
    birthdate: Date;
    nationality: string;
    marital_status: MaritalStatus;
    income:string;
    number_of_dependants: number | string; 
    contact_information: {
        address: string;
        phone_number: string;
        email: string;
    };
    curp?: string; 

    // Financial Info
    employmentStatus: EmploymentStatus;
    credit_score: number; 
    existing_debts: Array<{
        debt_type: string; 
        amount: number; 
        interest_rate: number; 
        monthly_payment: number; 
    }>;
    
}
