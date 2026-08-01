import { registerAs } from '@nestjs/config';
import { env } from './env';

export const appConfig = registerAs('app', () => ({
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  corsOrigins: env.CORS_ORIGINS,
  swaggerEnabled: env.SWAGGER_ENABLED,
  profileViewMilestones: env.PROFILE_VIEW_MILESTONES,
  inviteExpiryDays: env.INVITE_EXPIRY_DAYS,
}));
