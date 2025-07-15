import { Customer, MasterItem, Invoice, Payment } from '@shared/schema';

/**
 * Data mapping utilities for SAP B1 integration
 * Handles transformation between SAP B1 and Thermopac data formats
 */

export interface SAPCustomer {
  CardCode: string;
  CardName: string;
  CardType: string;
  Phone1?: string;
  Phone2?: string;
  Fax?: string;
  E_Mail?: string;
  MailAddres?: string;
  MailCity?: string;
  MailCountr?: string;
  MailZipCod?: string;
  Currency?: string;
  CreditLine?: number;
  Balance?: number;
  GroupCode?: number;
  LicTradNum?: string;
  VATRegNum?: string;
  CreateDate?: Date;
  UpdateDate?: Date;
}

export interface SAPItem {
  ItemCode: string;
  ItemName: string;
  FrgnName?: string;
  ItmsGrpCod?: number;
  CstGrpCode?: number;
  VatGourpSa?: string;
  VatGroupPu?: string;
  SalUnitMsr?: string;
  PurUnitMsr?: string;
  SHeight1?: number;
  SWidth1?: number;
  SLength1?: number;
  SWeight1?: number;
  CreateDate?: Date;
  UpdateDate?: Date;
  validFor?: string;
}

export interface SAPInvoice {
  DocEntry: number;
  DocNum: string;
  DocDate: Date;
  DocDueDate: Date;
  CardCode: string;
  CardName: string;
  DocCur: string;
  DocRate: number;
  DocTotal: number;
  DocTotalFC: number;
  VatSum: number;
  VatSumFC: number;
  DiscSum: number;
  DiscSumFC: number;
  PaidToDate: number;
  PaidFC: number;
  Comments?: string;
  CreateDate: Date;
  UpdateDate: Date;
  Phone1?: string;
  E_Mail?: string;
  MailAddres?: string;
  MailCity?: string;
}

export interface SAPPayment {
  DocEntry: number;
  DocNum: string;
  DocDate: Date;
  CardCode: string;
  CardName: string;
  DocCur: string;
  DocRate: number;
  DocTotal: number;
  DocTotalFC: number;
  CashSum: number;
  CheckSum: number;
  TrsfrSum: number;
  Comments?: string;
  CreateDate: Date;
  UpdateDate: Date;
}

/**
 * Map SAP B1 Customer to Thermopac Customer
 */
export function mapSAPCustomerToThermopac(sapCustomer: SAPCustomer): Partial<Customer> {
  return {
    sapCustomerCode: sapCustomer.CardCode,
    name: sapCustomer.CardName,
    email: sapCustomer.E_Mail || '',
    phone: sapCustomer.Phone1 || '',
    fax: sapCustomer.Fax || '',
    address: sapCustomer.MailAddres || '',
    city: sapCustomer.MailCity || '',
    country: sapCustomer.MailCountr || '',
    zipCode: sapCustomer.MailZipCod || '',
    currency: sapCustomer.Currency || 'INR',
    creditLimit: sapCustomer.CreditLine || 0,
    outstandingBalance: sapCustomer.Balance || 0,
    taxId: sapCustomer.VATRegNum || '',
    licenseNumber: sapCustomer.LicTradNum || '',
    isActive: true,
    source: 'SAP B1',
    lastSyncDate: new Date(),
    sapCreateDate: sapCustomer.CreateDate,
    sapUpdateDate: sapCustomer.UpdateDate
  };
}

/**
 * Map Thermopac Customer to SAP B1 Customer
 */
export function mapThermopacCustomerToSAP(customer: Customer): Partial<SAPCustomer> {
  return {
    CardCode: customer.sapCustomerCode || `TC${customer.id}`,
    CardName: customer.name,
    CardType: 'C',
    Phone1: customer.phone,
    E_Mail: customer.email,
    MailAddres: customer.address,
    MailCity: customer.city,
    MailCountr: customer.country,
    MailZipCod: customer.zipCode,
    Currency: customer.currency || 'INR',
    CreditLine: customer.creditLimit || 0,
    VATRegNum: customer.taxId,
    LicTradNum: customer.licenseNumber
  };
}

/**
 * Map SAP B1 Item to Thermopac MasterItem
 */
export function mapSAPItemToThermopac(sapItem: SAPItem): Partial<MasterItem> {
  return {
    sapItemCode: sapItem.ItemCode,
    itemCode: sapItem.ItemCode,
    description: sapItem.ItemName,
    foreignDescription: sapItem.FrgnName,
    category: sapItem.ItmsGrpCod?.toString() || '',
    unit: sapItem.SalUnitMsr || 'EA',
    purchaseUnit: sapItem.PurUnitMsr || 'EA',
    height: sapItem.SHeight1 || 0,
    width: sapItem.SWidth1 || 0,
    length: sapItem.SLength1 || 0,
    weight: sapItem.SWeight1 || 0,
    isActive: sapItem.validFor === 'Y',
    source: 'SAP B1',
    lastSyncDate: new Date(),
    sapCreateDate: sapItem.CreateDate,
    sapUpdateDate: sapItem.UpdateDate
  };
}

/**
 * Map SAP B1 Invoice to Thermopac Invoice
 */
export function mapSAPInvoiceToThermopac(sapInvoice: SAPInvoice): Partial<Invoice> {
  return {
    sapDocEntry: sapInvoice.DocEntry,
    invoiceNumber: sapInvoice.DocNum,
    invoiceDate: sapInvoice.DocDate,
    dueDate: sapInvoice.DocDueDate,
    customerId: null, // Will be resolved by customer mapping
    sapCustomerCode: sapInvoice.CardCode,
    customerName: sapInvoice.CardName,
    currency: sapInvoice.DocCur,
    exchangeRate: sapInvoice.DocRate,
    totalAmount: sapInvoice.DocTotal,
    totalAmountFC: sapInvoice.DocTotalFC,
    vatAmount: sapInvoice.VatSum,
    vatAmountFC: sapInvoice.VatSumFC,
    discountAmount: sapInvoice.DiscSum,
    discountAmountFC: sapInvoice.DiscSumFC,
    paidAmount: sapInvoice.PaidToDate,
    paidAmountFC: sapInvoice.PaidFC,
    outstandingAmount: sapInvoice.DocTotal - sapInvoice.PaidToDate,
    outstandingAmountFC: sapInvoice.DocTotalFC - sapInvoice.PaidFC,
    status: sapInvoice.PaidToDate >= sapInvoice.DocTotal ? 'Paid' : 
           sapInvoice.PaidToDate > 0 ? 'Partially Paid' : 'Pending',
    notes: sapInvoice.Comments,
    source: 'SAP B1',
    lastSyncDate: new Date(),
    sapCreateDate: sapInvoice.CreateDate,
    sapUpdateDate: sapInvoice.UpdateDate
  };
}

/**
 * Map SAP B1 Payment to Thermopac Payment
 */
export function mapSAPPaymentToThermopac(sapPayment: SAPPayment): Partial<Payment> {
  return {
    sapDocEntry: sapPayment.DocEntry,
    paymentNumber: sapPayment.DocNum,
    paymentDate: sapPayment.DocDate,
    customerId: null, // Will be resolved by customer mapping
    sapCustomerCode: sapPayment.CardCode,
    customerName: sapPayment.CardName,
    currency: sapPayment.DocCur,
    exchangeRate: sapPayment.DocRate,
    amount: sapPayment.DocTotal,
    amountFC: sapPayment.DocTotalFC,
    cashAmount: sapPayment.CashSum,
    checkAmount: sapPayment.CheckSum,
    transferAmount: sapPayment.TrsfrSum,
    paymentMethod: sapPayment.CashSum > 0 ? 'Cash' : 
                   sapPayment.CheckSum > 0 ? 'Check' : 
                   sapPayment.TrsfrSum > 0 ? 'Bank Transfer' : 'Other',
    unallocatedAmount: sapPayment.DocTotal, // Will be updated after allocation mapping
    status: 'Received',
    notes: sapPayment.Comments,
    source: 'SAP B1',
    lastSyncDate: new Date(),
    sapCreateDate: sapPayment.CreateDate,
    sapUpdateDate: sapPayment.UpdateDate
  };
}

/**
 * Data validation utilities
 */
export class DataValidator {
  /**
   * Validate SAP Customer data
   */
  static validateSAPCustomer(sapCustomer: SAPCustomer): string[] {
    const errors: string[] = [];
    
    if (!sapCustomer.CardCode || sapCustomer.CardCode.trim() === '') {
      errors.push('Customer code is required');
    }
    
    if (!sapCustomer.CardName || sapCustomer.CardName.trim() === '') {
      errors.push('Customer name is required');
    }
    
    if (sapCustomer.E_Mail && !this.isValidEmail(sapCustomer.E_Mail)) {
      errors.push('Invalid email format');
    }
    
    return errors;
  }

  /**
   * Validate SAP Item data
   */
  static validateSAPItem(sapItem: SAPItem): string[] {
    const errors: string[] = [];
    
    if (!sapItem.ItemCode || sapItem.ItemCode.trim() === '') {
      errors.push('Item code is required');
    }
    
    if (!sapItem.ItemName || sapItem.ItemName.trim() === '') {
      errors.push('Item name is required');
    }
    
    return errors;
  }

  /**
   * Validate SAP Invoice data
   */
  static validateSAPInvoice(sapInvoice: SAPInvoice): string[] {
    const errors: string[] = [];
    
    if (!sapInvoice.DocNum || sapInvoice.DocNum.trim() === '') {
      errors.push('Invoice number is required');
    }
    
    if (!sapInvoice.CardCode || sapInvoice.CardCode.trim() === '') {
      errors.push('Customer code is required');
    }
    
    if (!sapInvoice.DocDate) {
      errors.push('Invoice date is required');
    }
    
    if (sapInvoice.DocTotal <= 0) {
      errors.push('Invoice total must be greater than 0');
    }
    
    return errors;
  }

  /**
   * Validate SAP Payment data
   */
  static validateSAPPayment(sapPayment: SAPPayment): string[] {
    const errors: string[] = [];
    
    if (!sapPayment.DocNum || sapPayment.DocNum.trim() === '') {
      errors.push('Payment number is required');
    }
    
    if (!sapPayment.CardCode || sapPayment.CardCode.trim() === '') {
      errors.push('Customer code is required');
    }
    
    if (!sapPayment.DocDate) {
      errors.push('Payment date is required');
    }
    
    if (sapPayment.DocTotal <= 0) {
      errors.push('Payment amount must be greater than 0');
    }
    
    return errors;
  }

  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

/**
 * Sync configuration
 */
export const SYNC_CONFIG = {
  batchSize: 100,
  retryAttempts: 3,
  retryDelay: 1000, // milliseconds
  syncInterval: 300000, // 5 minutes
  maxSyncAge: 3600000, // 1 hour
  enableRealTimeSync: true,
  enableBidirectionalSync: false, // Start with SAP -> Thermopac only
  conflictResolution: 'sap_wins' as 'sap_wins' | 'thermopac_wins' | 'manual'
};