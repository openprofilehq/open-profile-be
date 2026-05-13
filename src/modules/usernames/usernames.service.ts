import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { RESERVED_USERNAMES } from './data/reserved-keywords';

const AMBIGUOUS_UNICODE_REGEX = /[\u0400-\u04FF\u0370-\u03FF\u4E00-\u9FFF]/;
const FORMAT_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export type UsernameCheckResult =
  | { available: true; normalizedUsername: string }
  | { available: false; reason: 'INVALID_FORMAT' | 'TAKEN' };

@Injectable()
export class UsernamesService {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
  ) {}

  async check(rawUsername: string): Promise<UsernameCheckResult> {
    const normalized = rawUsername.trim().toLowerCase();

    if (AMBIGUOUS_UNICODE_REGEX.test(normalized)) {
      return { available: false, reason: 'INVALID_FORMAT' };
    }

    if (normalized.length < 3 || normalized.length > 30) {
      return { available: false, reason: 'INVALID_FORMAT' };
    }

    if (!FORMAT_REGEX.test(normalized)) {
      return { available: false, reason: 'INVALID_FORMAT' };
    }

    if (/--/.test(normalized)) {
      return { available: false, reason: 'INVALID_FORMAT' };
    }

    if (RESERVED_USERNAMES.has(normalized)) {
      return { available: false, reason: 'INVALID_FORMAT' };
    }

    const existing = await this.profileRepository.findOne({
      where: { username: normalized },
    });

    if (existing) {
      return { available: false, reason: 'TAKEN' };
    }

    return { available: true, normalizedUsername: normalized };
  }
}
