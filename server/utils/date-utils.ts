import { format } from 'date-fns';

/**
 * Calculates the next calibration date based on the last calibration date and frequency
 * @param lastCalibrationDate The date of the last calibration
 * @param frequency The calibration frequency (e.g., "6 Months", "1 Year")
 * @returns Formatted date string for the next calibration
 */
export function calculateNextCalibrationDate(lastCalibrationDate: string, frequency: string): string {
  const lastDate = new Date(lastCalibrationDate);
  const nextDate = new Date(lastDate);
  
  switch (frequency) {
    case '1 Month':
      nextDate.setMonth(lastDate.getMonth() + 1);
      break;
    case '3 Months':
      nextDate.setMonth(lastDate.getMonth() + 3);
      break;
    case '6 Months':
      nextDate.setMonth(lastDate.getMonth() + 6);
      break;
    case '1 Year':
      nextDate.setFullYear(lastDate.getFullYear() + 1);
      break;
    case '2 Years':
      nextDate.setFullYear(lastDate.getFullYear() + 2);
      break;
    case '3 Years':
      nextDate.setFullYear(lastDate.getFullYear() + 3);
      break;
    case '5 Years':
      nextDate.setFullYear(lastDate.getFullYear() + 5);
      break;
    default:
      nextDate.setFullYear(lastDate.getFullYear() + 1);
  }
  
  return format(nextDate, 'yyyy-MM-dd');
}

/**
 * Calculate days until next calibration
 * @param nextCalibrationDate The next calibration date
 * @returns Number of days until next calibration or null if date is invalid
 */
export function getDaysUntilCalibration(nextCalibrationDate: string | null): number | null {
  if (!nextCalibrationDate) return null;
  
  const today = new Date();
  const nextDate = new Date(nextCalibrationDate);
  
  // Calculate the difference in milliseconds
  const diffTime = nextDate.getTime() - today.getTime();
  
  // Convert to days and round
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}