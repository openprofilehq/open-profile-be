import { Request } from 'express';

export function extractClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];

  if (typeof xff === 'string') {
    return xff.split(',')[0].trim();
  }

  if (Array.isArray(xff)) {
    return xff[0];
  }

  return req.ip || req.socket.remoteAddress || '0.0.0.0';
}