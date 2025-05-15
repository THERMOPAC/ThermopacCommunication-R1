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
export function formatRupees(amount: number, useLakhs: boolean = false): string {
  if (amount === null || amount === undefined) return '₹0.00';
  
  if (useLakhs) {
    // Format in Indian numbering system (lakhs and crores)
    if (amount >= 10000000) {
      // For crores (≥ 1 crore)
      return `₹${(amount / 10000000).toFixed(2)} Cr`;
    } else if (amount >= 100000) {
      // For lakhs (≥ 1 lakh)
      return `₹${(amount / 100000).toFixed(2)} L`;
    }
  }
  
  // Standard formatting with comma separators
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
