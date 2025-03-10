import { Injectable, Logger } from '@nestjs/common';
import { CreditDTO, EmploymentStatus, MaritalStatus } from './dto/credit.dto';
import { CreditContext, EligibilityResult } from '../schemas/conversation.schema';

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  /**
   * Calculate credit eligibility based on the provided credit data
   * @param creditData The credit information to evaluate
   * @returns EligibilityResult with score, status and explanation
   */
  async calculateEligibility(creditData: CreditDTO): Promise<EligibilityResult> {
    this.logger.log(`Calculating eligibility for: ${creditData.full_name}`);
    
    try {
      // Validate data completeness
      this.validateCreditData(creditData);
      
      const numericIncome = creditData.income
      
      // Calculate scores for each factor
      const scoreBreakdown = this.getScoreBreakdown(creditData, numericIncome);
      
      // Calculate total score
      const totalScore = this.calculateTotalScore(scoreBreakdown);
      
      // Determine eligibility
      const isEligible = totalScore >= 70;
      const reason = this.generateEligibilityReason(totalScore, scoreBreakdown, creditData);
      
      return { isEligible, score: Math.round(totalScore), reason };
    } catch (error) {
      this.logger.error(`Error calculating eligibility: ${error.message}`);
      return { isEligible: false, score: 0, reason: `Unable to calculate eligibility: ${error.message}` };
    }
  }

  /**
   * Check if the credit information is complete enough for eligibility check
   */
  checkCreditInfoCompleteness(creditInfo: CreditContext): boolean {
    const requiredFields = ['full_name', 'birthdate', 'marital_status', 'credit_info', 'phone_number', 'employmentStatus', 'credit_score'];
    return requiredFields.every(field => creditInfo[field] != null && creditInfo[field] !== '');
  }

  /**
   * Create a message with eligibility results
   */
  createEligibilityResultMessage(creditInfo: CreditContext, eligibilityResult: EligibilityResult): string {
    const debtsInfo = (creditInfo.existing_debts || []).map(debt => 
      `    - Type: ${debt.debt_type}, Amount: $${debt.amount}, Monthly: $${debt.monthly_payment || 'N/A'}, Rate: ${debt.interest_rate || 'N/A'}%`
    ).join('\n');

    return `
RESULTADO_ELEGIBILIDAD_CREDITO
INFORMACIÓN DEL SOLICITANTE:
- Nombre Completo: ${creditInfo.full_name || 'N/A'}
- Fecha de Nacimiento: ${creditInfo.birthdate ? new Date(creditInfo.birthdate).toLocaleDateString() : 'N/A'}
- Nacionalidad: ${creditInfo.nationality || 'N/A'}
- Estado Civil: ${creditInfo.marital_status || 'N/A'}
- Número de Dependientes: ${creditInfo.number_of_dependants || '0'}
- Dirección: ${creditInfo.address || 'N/A'}
- Teléfono: ${creditInfo.phone_number || 'N/A'}
- Correo Electrónico: ${creditInfo.email || 'N/A'}
- CURP: ${creditInfo.curp || 'N/A'}
- Situación Laboral: ${creditInfo.employmentStatus || 'N/A'}
- Puntaje Crediticio: ${creditInfo.credit_score || 'N/A'}
- Ingresos: ${creditInfo.credit_info || 'N/A'}

DEUDAS EXISTENTES:
${debtsInfo.length ? debtsInfo : '    - No se reportaron deudas existentes'}

EVALUACIÓN DE ELEGIBILIDAD:
- Elegible: ${eligibilityResult.isEligible ? 'Sí' : 'No'}
- Puntaje: ${eligibilityResult.score}/100
- Motivo: ${eligibilityResult.reason}
`;
  }

  /**
   * Get credit application status
   */
  getCreditApplicationStatus(creditInfo: CreditContext): { isComplete: boolean, missingFields: string[] } {
    if (!creditInfo) {
      return { isComplete: false, missingFields: ['All credit information is missing'] };
    }
    
    const requiredFields = [
      'full_name', 'birthdate', 'nationality', 'marital_status', 'number_of_dependants', 'address', 
      'phone_number', 'email', 'employmentStatus', 'credit_score', 'credit_info'
    ];
    
    const missingFields = requiredFields.filter(field => !creditInfo[field]);
    
    return { isComplete: missingFields.length === 0, missingFields };
  }
  
  /**
   * Parse income string to number
   */
  private parseIncome(income: string): number {
    return parseFloat(income.replace(/[^0-9.]/g, '')) || 0;
  }
  
  /**
   * Validates that all required credit data is present
   */
  private validateCreditData(creditData: CreditDTO): void {
    const requiredFields = ['full_name', 'birthdate', 'nationality', 'marital_status', 'income', 
                             'number_of_dependants', 'address', 'phone_number', 'email', 'employmentStatus', 
                             'credit_score', 'existing_debts'];

    const missingFields = requiredFields.filter(field => !creditData[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required credit information: ${missingFields.join(', ')}`);
    }
    
    if (creditData.credit_score < 300 || creditData.credit_score > 850) {
      throw new Error('Credit score must be between 300 and 850');
    }
    
    const birthDate = new Date(creditData.birthdate);
    const age = this.calculateAge(birthDate);
    if (age < 18) {
      throw new Error('Applicant must be at least 18 years old');
    }
  }
  
  /**
   * Helper to calculate age from birthdate
   */
  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Get a breakdown of scores based on input credit data
   */
  private getScoreBreakdown(creditData: CreditDTO, income: number) {
    return {
      creditScore: this.scoreCreditScore(creditData.credit_score),
      employment: this.scoreEmploymentStatus(creditData.employmentStatus),
      debt: this.scoreExistingDebt(creditData.existing_debts ?? [], income),
      income: this.scoreIncome(income),
      demographic: this.scoreDemographicFactors(creditData),
      dependents: this.scoreDependents(creditData.number_of_dependants, income),
    };
  }
  
  
  /**
   * Calculate the total score based on the breakdown
   */
  private calculateTotalScore(scoreBreakdown: Record<string, number>) {
    return Object.values(scoreBreakdown).reduce((sum, score) => sum + score, 0);
  }

  /**
   * Generate a human-readable reason for the eligibility result
   */
  private generateEligibilityReason(totalScore: number, breakdown: Record<string, number>, data: CreditDTO): string {
    if (totalScore >= 90) return 'Excellent creditworthiness. Eligible for our premium credit products with favorable terms.';
    if (totalScore >= 80) return 'Very good creditworthiness. Eligible for most credit products with competitive rates.';
    if (totalScore >= 70) return 'Good creditworthiness. Eligible for standard credit products.';
    if (totalScore >= 60) return `Not eligible at this time. Your credit score (${data.credit_score}) is below our threshold, but you're close. Consider improving your credit score and reapplying in 3-6 months.`;
    
    const factors = Object.entries(breakdown).sort((a, b) => a[1] - b[1]);
    const [lowestFactor] = factors[0];
    
    let specificReason = '';
    switch (lowestFactor) {
      case 'creditScore': specificReason = `Your credit score (${data.credit_score}) is below our minimum requirements.`; break;
      case 'employment': specificReason = 'Your current employment status affects your eligibility.'; break;
      case 'debt': specificReason = 'Your current debt level is too high relative to our criteria.'; break;
      case 'income': specificReason = 'Your income level does not meet our minimum requirements for this credit product.'; break;
      case 'dependents': specificReason = 'The number of dependents relative to your income affects your eligibility.'; break;
      default: specificReason = 'Multiple factors contributed to this decision.';
    }
    
    return `Not eligible at this time. ${specificReason} Consider improving these factors before reapplying.`;
  }

  /**
   * Helper functions for scoring (Credit Score, Employment, Debt, etc.)
   */
  private scoreCreditScore(creditScore: number): number {
    if (!creditScore) return 0;
    if (creditScore >= 800) return 30;
    if (creditScore >= 740) return 25;
    if (creditScore >= 670) return 20;
    if (creditScore >= 580) return 15;
    return 5;
  }

  private scoreEmploymentStatus(status: EmploymentStatus): number {
    const employmentMap = {
      [EmploymentStatus.EMPLOYED]: 20,
      [EmploymentStatus.SELF_EMPLOYED]: 18,
      [EmploymentStatus.RETIRED]: 15,
      [EmploymentStatus.STUDENT]: 10,
      [EmploymentStatus.UNEMPLOYED]: 5,
    };
    return employmentMap[status] || 0;
  }
  

  private scoreExistingDebt(debts: any[], income: number): number {
    if (!debts || debts.length === 0) return 20;
    const totalDebtAmount = debts.reduce((sum, debt: any) => sum + debt.amount, 0);
    if (totalDebtAmount < income * 0.5) return 20;
    if (totalDebtAmount < income * 1.5) return 15;
    return 10;
  }

  private scoreIncome(income: number): number {
    if (income >= 10000) return 20;
    if (income >= 5000) return 15;
    return 10;
  }

  private scoreDemographicFactors(creditData: CreditDTO): number {
    // Add scoring logic for demographic factors like nationality, location, etc.
    return 10;
  }

  private scoreDependents(dependents: number, income: number): number {
    if (dependents === 0) return 20;
    if (dependents <= 2) return 15;
    return 10;
  }
}
