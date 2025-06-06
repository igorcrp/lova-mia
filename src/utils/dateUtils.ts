
/**
 * Utility functions for working with dates
 */

import { format, addDays, subDays, subMonths, subYears, differenceInDays, differenceInBusinessDays, isWeekend } from 'date-fns';

/**
 * Format a date as YYYY-MM-DD
 */
export function formatDateToYYYYMMDD(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Count the number of business days between two dates
 * Using date-fns differenceInBusinessDays to ensure accurate calculation
 */
export function countBusinessDays(startDate: Date, endDate: Date): number {
  // Use date-fns' built-in function for accurate business day counting
  // This automatically excludes weekends
  const businessDays = differenceInBusinessDays(endDate, startDate);
  console.info(`Counting business days from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}: ${businessDays} days`);
  return businessDays;
}

/**
 * Get the start date for a given period string
 */
export function getStartDateForPeriod(period: string): Date {
  const today = new Date();
  let startDate: Date;
  
  // Parse period string and normalize to lowercase for case-insensitive comparison
  const normalizedPeriod = period.toLowerCase();
  
  switch (normalizedPeriod) {
    case '1m':
    case '1 month':
      startDate = subMonths(today, 1);
      break;
    case '2m':
    case '2 months':
      startDate = subMonths(today, 2);
      break;
    case '3m':
    case '3 months':
      startDate = subMonths(today, 3);
      break;
    case '6m':
    case '6 months':
      startDate = subMonths(today, 6);
      break;
    case '1y':
    case '1 year':
      startDate = subYears(today, 1);
      break;
    case '2y':
    case '2 years':
      startDate = subYears(today, 2);
      break;
    case '3y':
    case '3 years':
      startDate = subYears(today, 3);
      break;
    case '5y':
    case '5 years':
      startDate = subYears(today, 5);
      break;
    case 'ytd':
      startDate = new Date(today.getFullYear(), 0, 1); // January 1st of current year
      break;
    case 'mtd':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1); // First day of current month
      break;
    case 'wtd':
      const dayOfWeek = today.getDay();
      // Ajuste para começar na segunda-feira (1) em vez de domingo (0)
      startDate = subDays(today, dayOfWeek === 0 ? 6 : dayOfWeek - 1); // Go back to Monday
      break;
    case '1w':
    case '1 week':
      startDate = subDays(today, 7);
      break;
    case '2w':
    case '2 weeks':
      startDate = subDays(today, 14);
      break;
    default:
      startDate = subMonths(today, 3); // Default to 3 months
      console.warn(`Unknown period "${period}", defaulting to 3 months`);
      break;
  }
  
  console.info(`Period "${period}" converted to start date: ${startDate.toLocaleDateString()}`);
  return startDate;
}

/**
 * Get the date range (start and end dates) for a given period string
 */
export function getDateRangeForPeriod(period: string): { startDate: string, endDate: string } {
  const today = new Date();
  const startDate = getStartDateForPeriod(period);
  
  return {
    startDate: formatDateToYYYYMMDD(startDate),
    endDate: formatDateToYYYYMMDD(today)
  };
}

/**
 * Map a period string to the number of days it represents
 */
export function getPeriodInDays(period: string): number {
  const today = new Date();
  const startDate = getStartDateForPeriod(period);
  
  return differenceInDays(today, startDate);
}

/**
 * Get a human-readable description of a period
 */
export function getPeriodDescription(period: string): string {
  switch (period) {
    case '1M':
    case '1 month':
      return 'Last Month';
    case '2M':
    case '2 months':
      return 'Last 2 Months';
    case '3M':
    case '3 months':
      return 'Last Quarter';
    case '6M':
    case '6 months':
      return 'Last 6 Months';
    case '1Y':
    case '1 year':
      return 'Last Year';
    case '2Y':
    case '2 years':
      return 'Last 2 Years';
    case '3Y':
    case '3 years':
      return 'Last 3 Years';
    case '5Y':
    case '5 years':
      return 'Last 5 Years';
    case 'YTD':
      return 'Year to Date';
    case 'MTD':
      return 'Month to Date';
    case 'WTD':
      return 'Week to Date';
    case '1W':
    case '1 week':
      return 'Last Week';
    case '2W':
    case '2 weeks':
      return 'Last 2 Weeks';
    default:
      return period;
  }
}

/**
 * Get the next business day after a date
 */
export function getNextBusinessDay(date: Date): Date {
  let nextDay = addDays(date, 1);
  while (isWeekend(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
}
