import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Request } from 'express';

@Injectable()
export class FingerprintService {
  generate(req: Request): string {
    const ip = req.ip ?? '0.0.0.0';
    const ua = String(req.headers['user-agent'] ?? '');
    const tz = String(req.headers['x-visitor-tz'] ?? 'unknown');
    return createHash('sha256').update(`${ip}|${ua}|${tz}`).digest('hex');
  }
}
