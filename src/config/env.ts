import { createEnv } from '@t3-oss/env-core';
import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'test', 'production', 'staging'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: z.coerce.number().int().positive().default(5432),
    DATABASE_USER: z.string().min(1),
    DATABASE_PASSWORD: z.string(),
    DATABASE_NAME: z.string().min(1),
    DATABASE_SYNC: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .default(false)
      .transform((v) => v === true || v === 'true'),
    DATABASE_LOGGING: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .default(false)
      .transform((v) => v === true || v === 'true'),
    DATABASE_SSL: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .default(false)
      .transform((v) => v === true || v === 'true'),

    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    JWT_RESET_SECRET: z
      .string()
      .min(32, 'JWT_RESET_SECRET must be at least 32 chars'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:5173')
      .transform((val) => val.split(',').map((v) => v.trim())),
    SWAGGER_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .default(true)
      .transform((v) => v === true || v === 'true'),
    RESEND_API_KEY: z.string().min(1),
    MAIL_FROM: z.string().min(1),
    CONTACT_EMAIL: z.string().min(1),
    FRONTEND_URL: z.string().url(),
    APP_URL: z.string().url(),
    CLIENT_ID: z.string().min(1),
    CLIENT_SECRET: z.string().min(1),
    GOOGLE_CALLBACK_URL: z.string().url(),
    REDIS_URL: z.string().min(1),
    BREVO_SENDER_NAME: z.string().min(1),
    BREVO_SMTP_USER: z.string().min(1),
    BREVO_SMTP_PASSWORD: z.string().min(1),
    /** Production only: shared parent domain for API cookies (e.g. .open-profile.hng14.com). Ignored in staging/dev. */
    COOKIE_DOMAIN: z.string().default(''),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export type Env = typeof env;
