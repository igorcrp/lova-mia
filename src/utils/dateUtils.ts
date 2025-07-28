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

/**
 * Verifica se uma data é o primeiro dia útil do mês
 * @param date Data a ser verificada
 * @returns true se for o primeiro dia útil do mês
 */
export function isFirstBusinessDayOfMonth(date: Date): boolean {
  const day = date.getDate();
  const dayOfWeek = date.getDay();
  
  // Se for o primeiro dia do mês e não for fim de semana
  if (day === 1 && dayOfWeek !== 0 && dayOfWeek !== 6) {
    return true;
  }
  
  // Se for o segundo dia do mês e o primeiro dia foi domingo
  if (day === 2 && dayOfWeek === 1 && new Date(date.getFullYear(), date.getMonth(), 1).getDay() === 0) {
    return true;
  }
  
  // Se for o terceiro dia do mês e os dois primeiros foram fim de semana
  if (day === 3 && dayOfWeek === 1) {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const secondDay = new Date(date.getFullYear(), date.getMonth(), 2).getDay();
    return firstDay === 6 && secondDay === 0;
  }
  
  return false;
}

/**
 * Verifica se uma data é o último dia útil do mês
 * @param date Data a ser verificada
 * @returns true se for o último dia útil do mês
 */
export function isLastBusinessDayOfMonth(date: Date): boolean {
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const lastDayOfMonthDay = lastDayOfMonth.getDay();
  
  // Se for o último dia do mês e não for fim de semana
  if (date.getDate() === lastDayOfMonth.getDate() && lastDayOfMonthDay !== 0 && lastDayOfMonthDay !== 6) {
    return true;
  }
  
  // Se for o penúltimo dia do mês e o último dia for sábado
  if (date.getDate() === lastDayOfMonth.getDate() - 1 && lastDayOfMonthDay === 6) {
    return true;
  }
  
  // Se for o antepenúltimo dia do mês e os dois últimos dias forem fim de semana
  if (date.getDate() === lastDayOfMonth.getDate() - 2 && lastDayOfMonthDay === 0) {
    const secondLastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0 - 1).getDay();
    return secondLastDay === 6;
  }
  
  return false;
}

/**
 * Verifica se o período selecionado é válido para análise mensal
 * @param period Período selecionado (ex: "1m", "3m", "6m", "1y", "2y", "5y")
 * @returns true se o período for válido para análise mensal
 */
export function isValidPeriodForMonthly(period: string): boolean {
  // Períodos válidos para análise mensal são 2 meses ou mais
  const validPeriods = ["2m", "3m", "6m", "1y", "2y", "5y"];
  return validPeriods.includes(period.toLowerCase());
}

