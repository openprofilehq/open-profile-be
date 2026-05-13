import { createEnv } from '@t3-oss/env-core';
import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
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

    CORS_ORIGIN: z.string().default('*'),
    SWAGGER_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .default(true)
      .transform((v) => v === true || v === 'true'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export type Env = typeof env;
