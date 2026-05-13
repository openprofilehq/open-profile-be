import type { Request } from 'express';
import { User } from '../../users/entities/user.entity';

export interface GoogleUser {
  email: string;
  fullName: string;
  givenName?: string;
  familyName?: string;
  avatar?: string;
  googleId: string;
}

export interface GoogleAuthRequest extends Request {
  user: User;
  ip: string;
}
