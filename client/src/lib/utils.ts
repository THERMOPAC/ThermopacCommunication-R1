import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a file size in bytes to a human-readable string
 * @param bytes File size in bytes
 * @returns Formatted string (e.g., "1.2 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format a date to a human-readable string
 * @param date Date object or string to format
 * @returns Formatted date string (e.g., "Apr 28, 2025")
 */
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Format a number as Indian Rupees
 * @param amount Amount to format
 * @param useLakhs Whether to format large numbers in lakhs/crores format
 * @returns Formatted rupees string (e.g., "₹1,234.56" or "₹1.23 Cr")
 */
export function formatRupees(amount: number | string, useLakhs: boolean = false): string {
  if (amount === null || amount === undefined) return '₹0.00';
  
  // Convert string to number if needed
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (useLakhs) {
    // Format in Indian numbering system (lakhs and crores)
    if (numAmount >= 10000000) {
      // For crores (≥ 1 crore)
      return `₹${(numAmount / 10000000).toFixed(2)} Cr`;
    } else if (numAmount >= 100000) {
      // For lakhs (≥ 1 lakh)
      return `₹${(numAmount / 100000).toFixed(2)} L`;
    }
  }
  
  // Standard formatting with comma separators
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numAmount);
}

/**
 * Get the Indian financial year (April to March) for a given date
 * @param date Date to get financial year for
 * @returns Financial year string in "YYZZ" format (e.g., "2526" for dates between Apr 1, 2025 to Mar 31, 2026)
 */
export function getIndianFinancialYear(date: Date): string {
  const month = date.getMonth(); // 0-11 (Jan-Dec)
  const year = date.getFullYear();
  
  // If month is January(0), February(1), or March(2), it's the previous year's financial year
  // Otherwise, it's the current year's financial year
  const startYear = month < 3 ? year - 1 : year;
  const endYear = startYear + 1;
  
  // Format as YYZZ (last two digits of each year)
  const startYearStr = startYear.toString().slice(-2);
  const endYearStr = endYear.toString().slice(-2);
  
  return `${startYearStr}${endYearStr}`;
}

/**
 * Get the next invoice number based on Indian financial year
 * @param issueDate Date of invoice issuance
 * @returns Formatted invoice number in format INV-YYZZ-SERIES
 */
export async function getNextInvoiceNumber(issueDate: Date): Promise<string> {
  // Get the financial year based on the issue date
  const financialYear = getIndianFinancialYear(issueDate);
  
  try {
    // Use our test endpoint to avoid authentication issues during development
    const response = await fetch(`/api/finance/test/invoice-number?date=${issueDate.toISOString().split('T')[0]}`);
    
    if (!response.ok) {
      throw new Error('Failed to get next invoice number');
    }
    
    const data = await response.json();
    return data.nextInvoiceNumber;
  } catch (error) {
    console.error('Error getting next invoice number:', error);
    // Fallback format if API fails
    return `INV-${financialYear}-001`;
  }
}

/**
 * Get the next payment reference number based on Indian financial year
 * @param paymentDate Date of payment
 * @returns Formatted payment reference number in format PAY-YYZZ-SERIES
 */
export async function getNextPaymentReferenceNumber(paymentDate: Date): Promise<string> {
  // Get the financial year based on the payment date
  const financialYear = getIndianFinancialYear(paymentDate);
  
  try {
    // Use our test endpoint to avoid authentication issues during development
    const response = await fetch(`/api/finance/test/payment-number?date=${paymentDate.toISOString().split('T')[0]}`);
    
    if (!response.ok) {
      throw new Error('Failed to get next payment reference number');
    }
    
    const data = await response.json();
    return data.nextPaymentNumber;
  } catch (error) {
    console.error('Error getting next payment reference number:', error);
    // Fallback format if API fails
    return `PAY-${financialYear}-001`;
  }
}
