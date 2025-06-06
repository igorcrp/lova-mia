/**
 * Utility functions for working with dates
 */

import { format, addDays, subDays, subMonths, subYears, addMonths, differenceInDays, differenceInBusinessDays, isWeekend, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

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
  
  // For Daytrade, the start date is typically today
  startDate = today;
  
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
 * Obtém o próximo dia útil após uma data
 */
export function getNextBusinessDay(date: Date): Date {
  let nextDay = addDays(date, 1);
  while (isWeekend(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
}


