import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreditApplication, CreditApplicationDocument } from './credit.schema';
import { CreateCreditApplicationDto } from './credit.dto';
import { LangchainChatService } from 'src/langchain-chat/langchainChat.service';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CreditService {
  constructor(
    @InjectModel(CreditApplication.name) private creditApplicationModel: Model<CreditApplicationDocument>,
    private readonly langchainChatService: LangchainChatService,
  ) {}

  async createApplication(
    createCreditDto: CreateCreditApplicationDto,
    sessionId: string
  ): Promise<CreditApplicationDocument | null> {
    const newApplication = new this.creditApplicationModel({
      ...createCreditDto,
      sessionId,
      submittedAt: new Date(),
      status: 'pending',
    });
  
    // Save the application first
    const savedApplication: any = await newApplication.save();
  
    // Evaluate the application
    await this.evaluateApplication(savedApplication._id.toString());
  
    // Return the updated application (which could be null)
    return this.creditApplicationModel.findById(savedApplication._id).exec();
  }
  

  async getApplicationById(id: string): Promise<CreditApplicationDocument> {
    const application = await this.creditApplicationModel.findById(id).exec();
    if (!application) {
        throw new Error(`Credit application with ID ${id} not found`);
    }
    return application;
}


  async getApplicationsBySessionId(sessionId: string): Promise<CreditApplicationDocument[]> {
    return this.creditApplicationModel.find({ sessionId }).sort({ submittedAt: -1 }).exec();
  }

  private async evaluateApplication(applicationId: string): Promise<void> {
    const application = await this.creditApplicationModel.findById(applicationId).exec();
    if (!application) {
      throw new Error(`Application with ID ${applicationId} not found`);
    }

    // Calculate debt-to-income ratio
    const monthlyIncome = application.income / 12;
    const existingDebtPayments = application.existingDebt || 0;
    const estimatedMonthlyPayment = this.calculateEstimatedMonthlyPayment(application.loanAmount);
    const debtToIncomeRatio = ((existingDebtPayments + estimatedMonthlyPayment) / monthlyIncome) * 100;

    // Calculate loan-to-value ratio
    const loanToValueRatio = (application.loanAmount / application.propertyValue) * 100;

    // Determine eligibility score (0-100)
    let eligibilityScore = 0;
    
    // Credit score component (max 35 points)
    if (application.creditScore >= 740) {
      eligibilityScore += 35;
    } else if (application.creditScore >= 700) {
      eligibilityScore += 30;
    } else if (application.creditScore >= 650) {
      eligibilityScore += 20;
    } else if (application.creditScore >= 600) {
      eligibilityScore += 10;
    } else {
      eligibilityScore += 0;
    }
    
    // Debt-to-income component (max 30 points)
    if (debtToIncomeRatio <= 28) {
      eligibilityScore += 30;
    } else if (debtToIncomeRatio <= 36) {
      eligibilityScore += 25;
    } else if (debtToIncomeRatio <= 43) {
      eligibilityScore += 15;
    } else if (debtToIncomeRatio <= 50) {
      eligibilityScore += 5;
    }
    
    // Loan-to-value component (max 25 points)
    if (loanToValueRatio <= 60) {
      eligibilityScore += 25;
    } else if (loanToValueRatio <= 80) {
      eligibilityScore += 20;
    } else if (loanToValueRatio <= 90) {
      eligibilityScore += 10;
    } else if (loanToValueRatio <= 95) {
      eligibilityScore += 5;
    }
    
    // Employment status component (max 10 points)
    if (application.employmentStatus === 'full-time') {
      eligibilityScore += 10;
    } else if (application.employmentStatus === 'part-time') {
      eligibilityScore += 5;
    } else if (application.employmentStatus === 'self-employed') {
      eligibilityScore += 7;
    }
    
    // Determine application status
    let status = 'pending';
    let decisionReason = '';
    
    if (eligibilityScore >= 70) {
      status = 'approved';
      decisionReason = 'Application meets credit requirements.';
    } else if (eligibilityScore >= 50) {
      status = 'approved-with-conditions';
      decisionReason = 'Application conditionally approved with higher interest rate.';
    } else {
      status = 'rejected';
      
      // Determine main rejection reason
      if (application.creditScore < 600) {
        decisionReason = 'Insufficient credit score.';
      } else if (debtToIncomeRatio > 50) {
        decisionReason = 'Debt-to-income ratio too high.';
      } else if (loanToValueRatio > 95) {
        decisionReason = 'Loan-to-value ratio exceeds guidelines.';
      } else {
        decisionReason = 'Multiple factors below eligibility thresholds.';
      }
    }
    
    // Update application with evaluation results
    application.eligibilityScore = eligibilityScore;
    application.status = status;
    application.decisionReason = decisionReason;
    application.additionalInfo = {
      ...application.additionalInfo,
      debtToIncomeRatio,
      loanToValueRatio,
      estimatedMonthlyPayment,
    };
    
    await application.save();
  }

  private calculateEstimatedMonthlyPayment(loanAmount: number): number {
    // Basic calculation for 30-year mortgage at 5% interest rate
    const annualInterestRate = 0.05;
    const monthlyInterestRate = annualInterestRate / 12;
    const loanTermMonths = 30 * 12;
    
    const monthlyPayment = (loanAmount * monthlyInterestRate) / 
      (1 - Math.pow(1 + monthlyInterestRate, -loanTermMonths));
    
    return monthlyPayment;
  }

  

  async generatePdf(applicationId: string): Promise<string> {
    const application = await this.creditApplicationModel.findById(applicationId).exec();
    if (!application) {
      throw new Error(`Application with ID ${applicationId} not found`);
    }

    // Create directory for PDFs if it doesn't exist
    const pdfDir = path.join(process.cwd(), 'pdf-reports');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const filename = `credit-report-${applicationId}.pdf`;
    const filePath = path.join(pdfDir, filename);
    
    // Create a PDF document
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);
    
    // Add content to the PDF
    doc.fontSize(25).text('Real Estate Credit Application Report', {
      align: 'center'
    });
    
    doc.moveDown();
    doc.fontSize(12).text(`Report Date: ${new Date().toLocaleDateString()}`, {
      align: 'right'
    });
    
    doc.moveDown();
    doc.fontSize(16).text('Applicant Information');
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Full Name: ${application.fullName}`);
    doc.fontSize(12).text(`Email: ${application.email}`);
    doc.fontSize(12).text(`Phone: ${application.phoneNumber}`);
    doc.fontSize(12).text(`Employment Status: ${application.employmentStatus}`);
    
    doc.moveDown();
    doc.fontSize(16).text('Property Details');
    doc.moveDown(0.5);
    if (application.propertyAddress) {
      doc.fontSize(12).text(`Property Address: ${application.propertyAddress}`);
    }
    if (application.propertyType) {
      doc.fontSize(12).text(`Property Type: ${application.propertyType}`);
    }
    doc.fontSize(12).text(`Property Value: $${application.propertyValue.toLocaleString()}`);
    
    doc.moveDown();
    doc.fontSize(16).text('Loan Information');
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Loan Amount: $${application.loanAmount.toLocaleString()}`);
    doc.fontSize(12).text(`Loan-to-Value Ratio: ${application.additionalInfo!.loanToValueRatio.toFixed(2)}%`);
    doc.fontSize(12).text(`Estimated Monthly Payment: $${application.additionalInfo!.estimatedMonthlyPayment.toFixed(2)}`);
    
    doc.moveDown();
    doc.fontSize(16).text('Financial Profile');
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Annual Income: $${application.income.toLocaleString()}`);
    doc.fontSize(12).text(`Credit Score: ${application.creditScore}`);
    doc.fontSize(12).text(`Existing Debt: $${(application.existingDebt || 0).toLocaleString()}`);
    doc.fontSize(12).text(`Debt-to-Income Ratio: ${application.additionalInfo!.debtToIncomeRatio.toFixed(2)}%`);
    
    doc.moveDown();
    doc.fontSize(16).text('Application Results', {
      underline: true
    });
    doc.moveDown(0.5);
    
    // Format status with color based on decision
    doc.fontSize(14);
    if (application.status === 'approved') {
      doc.fillColor('green').text(`Status: APPROVED`, { continued: true }).fillColor('black');
    } else if (application.status === 'approved-with-conditions') {
      doc.fillColor('orange').text(`Status: APPROVED WITH CONDITIONS`, { continued: true }).fillColor('black');
    } else {
      doc.fillColor('red').text(`Status: ${application.status.toUpperCase()}`, { continued: true }).fillColor('black');
    }
    
    doc.moveDown();
    doc.fontSize(12).text(`Eligibility Score: ${application.eligibilityScore}/100`);
    doc.fontSize(12).text(`Decision Reason: ${application.decisionReason}`);
    
    doc.moveDown(2);
    doc.fontSize(10).text('This credit assessment is provided for informational purposes only. Final approval of any loan or credit product is subject to verification of all information provided, property appraisal, and underwriting guidelines.', {
      align: 'center',
      width: 400
    });
    
    // Finalize the PDF
    doc.end();
    
    // Return a promise that resolves when the file is written
    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(filePath));
      writeStream.on('error', reject);
    });
  }

  async processAgentConversationForCredit(sessionId: string): Promise<string | null> {
    // Get the conversation history
    const conversation = await this.langchainChatService.getConversation(sessionId);
    if (!conversation || conversation.messages.length === 0) {
      return null;
    }
  
    // Get the latest application for this session if it exists
    const existingApplications: CreditApplicationDocument[] = await this.getApplicationsBySessionId(sessionId);
    if (existingApplications.length === 0) {
      return null;
    }
  
    const latestApplication = existingApplications[0];
    
    // Ensure we have a valid application ID
    if (!latestApplication || !latestApplication._id) {
      return null;
    }
  
    // Generate PDF report
    const pdfPath = await this.generatePdf(latestApplication._id.toString());
  
    return pdfPath;
  }
}