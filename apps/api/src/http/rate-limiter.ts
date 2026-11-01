import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiError } from './ApiError.js';

export interface RateLimiterOptions {
  windowMs?: number; // Time window in milliseconds (default: 60,000ms = 1 minute)
  maxRequests?: number; // Max requests allowed per window (default: 30)
  enableAbuseLog?: boolean;
}

interface ClientBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Anonymize client IP to avoid storing or logging identifiable personal data.
 * IPv4: replaces last octet with '0/24'.
 * IPv6 or unknown: SHA-256 digest truncated to 16 characters.
 */
export function anonymizeIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const cleanIp = ip.replace(/^::ffff:/, ''); // Strip IPv4-mapped IPv6 prefix
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) {
    const parts = cleanIp.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  return createHash('sha256').update(cleanIp).digest('hex').slice(0, 16);
}

/**
 * In-memory sliding window rate limiter for public endpoints.
 * Provides transparent Retry-After and rate-limit headers.
 * Logs abuse warnings without exposing personally identifiable addresses.
 */
export function createRateLimiter(options: RateLimiterOptions = {}): RequestHandler {
  const windowMs = options.windowMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 30;
  const enableAbuseLog = options.enableAbuseLog ?? true;

  const clients = new Map<string, ClientBucket>();

  // Periodic cleanup of idle buckets to avoid memory leak
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of clients.entries()) {
      if (now - bucket.lastRefill > windowMs * 2) {
        clients.delete(key);
      }
    }
  }, windowMs);
  cleanupInterval.unref?.();

  return (request: Request, response: Response, next: NextFunction) => {
    const rawIp =
      request.ip ||
      (typeof request.headers['x-forwarded-for'] === 'string'
        ? (request.headers['x-forwarded-for'].split(',')[0]?.trim() ?? '')
        : '') ||
      request.socket.remoteAddress ||
      'unknown';

    const clientKey = anonymizeIp(rawIp);
    const now = Date.now();

    let bucket = clients.get(clientKey);
    if (!bucket) {
      bucket = { tokens: maxRequests, lastRefill: now };
      clients.set(clientKey, bucket);
    } else {
      // Calculate token refill based on elapsed time
      const elapsed = now - bucket.lastRefill;
      if (elapsed > windowMs) {
        bucket.tokens = maxRequests;
        bucket.lastRefill = now;
      }
    }

    response.setHeader('X-RateLimit-Limit', maxRequests.toString());

    if (bucket.tokens <= 0) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.lastRefill + windowMs - now) / 1000));
      response.setHeader('Retry-After', retryAfterSeconds.toString());
      response.setHeader('X-RateLimit-Remaining', '0');
      response.setHeader(
        'X-RateLimit-Reset',
        Math.ceil((bucket.lastRefill + windowMs) / 1000).toString(),
      );

      if (enableAbuseLog) {
        console.warn(
          `[SecurityAlert] Rate limit exceeded for client [${clientKey}] on ${request.method} ${request.path}. Retry-After: ${retryAfterSeconds}s.`,
        );
      }

      next(
        new ApiError(
          429,
          'RATE_LIMIT_EXCEEDED',
          `Too many requests from this address. Please wait ${retryAfterSeconds} second(s) before retrying, or call 112 immediately for urgent emergency assistance.`,
        ),
      );
      return;
    }

    bucket.tokens -= 1;
    response.setHeader('X-RateLimit-Remaining', bucket.tokens.toString());
    next();
  };
}
