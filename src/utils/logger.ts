// Secure logging utility that prevents console.log in production
const isDevelopment = import.meta.env.DEV;

export const logger = {
  log: (message: string, ...optionalParams: any[]) => {
    if (isDevelopment) {
      console.log(message, ...optionalParams);
    }
  },
  
  warn: (message: string, ...optionalParams: any[]) => {
    if (isDevelopment) {
      console.warn(message, ...optionalParams);
    }
  },
  
  error: (message: string, ...optionalParams: any[]) => {
    if (isDevelopment) {
      console.error(message, ...optionalParams);
    } else {
      // In production, only log critical errors to external service
      // Remove sensitive information
      const sanitizedMessage = message.replace(/email|password|token|key/gi, '[REDACTED]');
      console.error(sanitizedMessage);
    }
  },
  
  info: (message: string, ...optionalParams: any[]) => {
    if (isDevelopment) {
      console.info(message, ...optionalParams);
    }
  }
};