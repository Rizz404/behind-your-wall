import { Request } from 'express';

/** Real client IP: prefer Cloudflare's header, then X-Forwarded-For, then the socket address. */
export function extractClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.length > 0) return cfIp;

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip ?? req.socket.remoteAddress ?? '';
}
