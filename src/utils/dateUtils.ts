/**
 * Utility functions for working with dates
 */

/**
 * Check if a date is a business day (not weekend)
 * @param date Date to check
 * @returns boolean
 */
export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Check if a date is the first business day of the week
 * @param date Date to check
 * @returns boolean
 */
export function isFirstBusinessDayOfWeek(date: Date): boolean {
  const day = date.getDay();
  return day === 1; // Monday is the first business day of the week
}

/**
 * Check if a date is the last business day of the week
 * @param date Date to check
 * @returns boolean
 */
export function isLastBusinessDayOfWeek(date: Date): boolean {
  const day = date.getDay();
  return day === 5; // Friday is the last business day of the week
}

/**
 * Get the next business day after a given date
 * @param date Starting date
 * @returns Date representing the next business day
 */
export function getNextBusinessDay(date: Date): Date {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  
  // If it's a weekend, keep moving forward
  while (!isBusinessDay(nextDay)) {
    nextDay.setDate(nextDay.getDate() + 1);
  }
  
  return nextDay;
}

/**
 * Check if a date is the first business day of the month
 * @param date Date to check
 * @returns boolean
 */
export function isFirstBusinessDayOfMonth(date: Date): boolean {
  const dayOfMonth = date.getDate();
  
  // If it's the 1st, 2nd, or 3rd day of the month and a business day
  return (dayOfMonth <= 3) && isBusinessDay(date);
}

/**
 * Check if a date is the last business day of the month
 * @param date Date to check
 * @returns boolean
 */
export function isLastBusinessDayOfMonth(date: Date): boolean {
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);
  
  // If the next day is in a different month, this is the last day
  if (nextDay.getMonth() !== date.getMonth()) {
    return isBusinessDay(date);
  }
  
  // Check if it's the last business day
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  
  // Find the last business day of the month
  while (!isBusinessDay(lastDayOfMonth)) {
    lastDayOfMonth.setDate(lastDayOfMonth.getDate() - 1);
  }
  
  return date.getDate() === lastDayOfMonth.getDate();
}

/**
 * Check if a date is the first business day of the year
 * @param date Date to check
 * @returns boolean
 */
export function isFirstBusinessDayOfYear(date: Date): boolean {
  // Check if it's in January (month 0) and one of the first few days
  return date.getMonth() === 0 && date.getDate() <= 3 && isBusinessDay(date);
}

/**
 * Check if a date is the last business day of the year
 * @param date Date to check
 * @returns boolean
 */
export function isLastBusinessDayOfYear(date: Date): boolean {
  // Check if it's December (month 11)
  if (date.getMonth() !== 11) {
    return false;
  }
  
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);
  
  // If the next day is in a different year, this is the last day
  if (nextDay.getFullYear() !== date.getFullYear()) {
    return isBusinessDay(date);
  }
  
  // Check if it's the last business day
  const lastDayOfYear = new Date(date.getFullYear(), 11, 31);
  
  // Find the last business day of the year
  while (!isBusinessDay(lastDayOfYear)) {
    lastDayOfYear.setDate(lastDayOfYear.getDate() - 1);
  }
  
  return date.getDate() === lastDayOfYear.getDate();
}

/**
 * Check if two dates are in the same week
 * @param date1 First date
 * @param date2 Second date
 * @returns boolean
 */
export function isSameWeek(date1: Date, date2: Date): boolean {
  // Get the week number for each date
  const getWeekNumber = (d: Date) => {
    const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
    const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  };
  
  return (
    date1.getFullYear() === date2.getFullYear() &&
    getWeekNumber(date1) === getWeekNumber(date2)
  );
}

/**
 * Check if two dates are in the same month
 * @param date1 First date
 * @param date2 Second date
 * @returns boolean
 */
export function isSameMonth(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
}

/**
 * Check if two dates are in the same year
 * @param date1 First date
 * @param date2 Second date
 * @returns boolean
 */
export function isSameYear(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear();
}

/**
 * Check if the selected period is valid for monthly analysis
 * @param period Period string (e.g., "1 month", "3 months")
 * @returns boolean
 */
export function isValidPeriodForMonthly(period: string): boolean {
  // Extract the number from the period string
  const match = period.match(/^(\d+)/);
  if (!match) return false;
  
  const months = parseInt(match[1], 10);
  return months >= 2;
}

/**
 * Check if the selected period is valid for annual analysis
 * @param period Period string (e.g., "1 year", "2 years")
 * @returns boolean
 */
export function isValidPeriodForAnnual(period: string): boolean {
  // Extract the number from the period string
  const match = period.match(/^(\d+)/);
  if (!match) return false;
  
  const years = parseInt(match[1], 10);
  return years >= 2;
}

/**
 * Format a date string (YYYY-MM-DD) to a more readable format (DD/MM/YYYY)
 * @param dateString Date string in YYYY-MM-DD format
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  const [year, month, day] = dateString.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Calculate the number of business days between two dates
 * @param startDate Start date
 * @param endDate End date
 * @returns Number of business days
 */
export function getBusinessDaysBetween(startDate: Date, endDate: Date): number {
  let count = 0;
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    if (isBusinessDay(currentDate)) {
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return count;
}

/**
 * Count business days between two dates
 * @param startDate Start date
 * @param endDate End date
 * @returns Number of business days
 */
export function countBusinessDays(startDate: Date, endDate: Date): number {
  return getBusinessDaysBetween(startDate, endDate);
}

/**
 * Format date to YYYY-MM-DD string
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get start date for a given period
 * @param period Period string (e.g., "1 month", "3 months", "1 year")
 * @returns Start date
 */
export function getStartDateForPeriod(period: string): Date {
  const today = new Date();
  const match = period.match(/^(\d+)\s+(day|week|month|year)s?$/i);
  
  if (!match) {
    console.warn(`Invalid period format: ${period}, using 1 month as default`);
    const result = new Date(today);
    result.setMonth(today.getMonth() - 1);
    return result;
  }
  
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const result = new Date(today);
  
  switch (unit) {
    case 'day':
      result.setDate(today.getDate() - amount);
      break;
    case 'week':
      result.setDate(today.getDate() - (amount * 7));
      break;
    case 'month':
      result.setMonth(today.getMonth() - amount);
      break;
    case 'year':
      result.setFullYear(today.getFullYear() - amount);
      break;
    default:
      console.warn(`Unknown time unit: ${unit}, using 1 month as default`);
      result.setMonth(today.getMonth() - 1);
  }
  
  return result;
}

/**
 * Get date range for a given period
 * @param period Period string (e.g., "1 month", "3 months", "1 year")
 * @returns Object with startDate and endDate as YYYY-MM-DD strings
 */
export function getDateRangeForPeriod(period: string): { startDate: string, endDate: string } {
  const startDate = getStartDateForPeriod(period);
  const endDate = new Date(); // Today
  
  return {
    startDate: formatDateToYYYYMMDD(startDate),
    endDate: formatDateToYYYYMMDD(endDate)
  };
}
