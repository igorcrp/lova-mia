// Enhanced rate limiting utility for client-side API calls

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class ClientRateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
  private maxRequests: number;
  private timeWindow: number;

  constructor(maxRequests: number = 100, timeWindowMs: number = 3600000) { // 1 hour default
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowMs;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(identifier);

    if (!entry || now > entry.resetTime) {
      // Reset or create new entry
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.timeWindow
      });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  getRemainingRequests(identifier: string): number {
    const entry = this.requests.get(identifier);
    if (!entry || Date.now() > entry.resetTime) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - entry.count);
  }

  getResetTime(identifier: string): number | null {
    const entry = this.requests.get(identifier);
    if (!entry || Date.now() > entry.resetTime) {
      return null;
    }
    return entry.resetTime;
  }

  // Clean up expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

// Export rate limiter instances for different use cases
export const apiRateLimiter = new ClientRateLimiter(60, 60000); // 60 requests per minute
export const authRateLimiter = new ClientRateLimiter(5, 300000); // 5 requests per 5 minutes
export const subscriptionRateLimiter = new ClientRateLimiter(10, 60000); // 10 requests per minute

// Cleanup expired entries every 10 minutes
setInterval(() => {
  apiRateLimiter.cleanup();
  authRateLimiter.cleanup();
  subscriptionRateLimiter.cleanup();
}, 600000);

export { ClientRateLimiter };