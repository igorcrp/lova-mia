// Security utilities for input validation and sanitization

/**
 * Sanitizes HTML content to prevent XSS attacks
 */
export const sanitizeHtml = (input: string): string => {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Validates email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
};

/**
 * Validates password strength
 */
export const isStrongPassword = (password: string): boolean => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

/**
 * Sanitizes SQL input to prevent injection
 */
export const sanitizeSqlInput = (input: string): string => {
  return input.replace(/['";\\-]/g, '');
};

/**
 * Validates stock code format
 */
export const isValidStockCode = (code: string): boolean => {
  const stockCodeRegex = /^[A-Z0-9]{1,10}(\.[A-Z]{1,3})?$/;
  return stockCodeRegex.test(code);
};

/**
 * Validates numeric input
 */
export const isValidNumber = (value: any): boolean => {
  return !isNaN(value) && isFinite(value);
};

/**
 * Rate limiting for API calls
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  constructor(private maxRequests: number = 100, private timeWindow: number = 3600000) {} // 1 hour
  
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || [];
    
    // Remove old requests outside time window
    const validRequests = userRequests.filter(time => now - time < this.timeWindow);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    return true;
  }
}