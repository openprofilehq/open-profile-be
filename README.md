# Open Profile Backend

REST API for the Open Profile platform — a social link-in-bio / portfolio builder.

## Tech Stack

| Concern       | Stack                                                    |
| ------------- | -------------------------------------------------------- |
| Runtime       | Node.js >= 20, TypeScript                                |
| Framework     | NestJS v11                                               |
| Database      | PostgreSQL 15 + TypeORM                                  |
| Cache / Queue | Redis (ioredis + BullMQ)                                 |
| Auth          | JWT (access + refresh tokens), Google OAuth 2.0          |
| Email         | Brevo SMTP (primary) + Resend API (fallback)             |
| Validation    | class-validator + class-transformer (runtime), Zod (env) |
| Image Proc    | Sharp                                                    |
| API Docs      | Swagger (`/docs`)                                        |

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **PostgreSQL** 15+
- **Redis** 7+

## Getting Started

```bash
# Install dependencies
pnpm install

# Copy and fill in environment variables
cp .env.example .env

# Run migrations
pnpm migration:run

# (Optional) seed data
pnpm seed

# Start dev server with hot reload
pnpm start:dev
```

Server starts at `http://localhost:3000`. Swagger docs at `http://localhost:3000/docs`.

## Scripts

| Script                    | Description                   |
| ------------------------- | ----------------------------- |
| `pnpm build`              | Compile to `dist/`            |
| `pnpm start:dev`          | Watch mode development        |
| `pnpm start:prod`         | Run compiled production build |
| `pnpm lint`               | ESLint with auto-fix          |
| `pnpm typecheck`          | TypeScript type checking      |
| `pnpm test`               | Unit tests (Jest)             |
| `pnpm test:e2e`           | End-to-end tests              |
| `pnpm migration:run`      | Run pending migrations        |
| `pnpm migration:generate` | Generate a new migration      |
| `pnpm db:reset`           | Drop schema + migrate + seed  |

## Environment Variables

Key variables (see `.env.example` for all):

| Variable                      | Description                                     |
| ----------------------------- | ----------------------------------------------- |
| `DATABASE_*`                  | PostgreSQL connection                           |
| `REDIS_URL`                   | Redis connection string                         |
| `JWT_ACCESS_SECRET`           | Access token signing key (min 32 chars)         |
| `JWT_REFRESH_SECRET`          | Refresh token signing key (min 32 chars)        |
| `JWT_RESET_SECRET`            | Password reset token signing key (min 32 chars) |
| `RESEND_API_KEY`              | Resend transactional email API key              |
| `BREVO_SMTP_*`                | Brevo SMTP credentials (primary email)          |
| `CLIENT_ID` / `CLIENT_SECRET` | Google OAuth 2.0 credentials                    |
| `FRONTEND_URL`                | Frontend URL for OAuth redirects                |
| `CORS_ORIGINS`                | Comma-separated allowed origins                 |

## Architecture

```
src/
├── main.ts                  # Entry point
├── app.module.ts            # Root module
├── config/                  # Env validation & app config
├── common/                  # Shared decorators, filters, interceptors, Redis, upload
├── database/                # Migrations, seeds, DataSource
└── modules/
    ├── auth/                # Register, login, JWT, OAuth, OTP, password reset
    ├── users/               # User CRUD, stale user cleanup (cron)
    ├── profile/             # Profile onboarding, components, publish
    ├── portfolio/           # Portfolio items CRUD
    ├── analytics/           # Profile view tracking & stats
    ├── search/              # Public profile search
    ├── contact/             # Contact form submissions
    ├── waitlist/            # Waitlist signup
    ├── usernames/           # Username availability & reserved keywords
    ├── upload/              # Image upload with Sharp processing
    ├── mail/                # Email templates & BullMQ processor
    ├── queue/               # BullMQ config & service
    ├── health/              # Liveness probe
    └── rate-limiter/        # Redis-based rate limiter
```

## Authentication

- **Default**: All routes require authentication via a global `JwtAuthGuard`.
- **Public routes** are marked with `@Public()`.
- **Access tokens** (15 min) and **refresh tokens** (7 days) are stored in httpOnly cookies.
- **Silent refresh**: The guard proactively refreshes tokens when the access token is close to expiry (< 3 min).
- **Token rotation**: Each refresh invalidates the previous refresh token (replay protection).
- **Rate limiting**: IP-based (login), email-based (forgot password, resend OTP), and brute-force lockout (5 attempts → 30 min).

## API Overview

All endpoints under `/api/v1/`.

| Module    | Key Endpoints                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| Auth      | register, login, logout, refresh, me, forgot-password, reset-password, verify-otp, resend-otp, Google OAuth |
| Users     | CRUD, onboarding-complete                                                                                   |
| Profiles  | Create (onboarding), publish, update, get public (cached), dashboard, component management                  |
| Portfolio | Add / update portfolio items                                                                                |
| Analytics | Record profile view (IP-deduplicated), get stats                                                            |
| Search    | Full-text search on published profiles                                                                      |
| Contact   | Submit contact form                                                                                         |
| Waitlist  | Signup + list                                                                                               |
| Usernames | Check availability                                                                                          |
| Uploads   | Image upload (profiles, projects, portfolio categories)                                                     |

## Database

7 tables: `users`, `profiles`, `components`, `portfolio_items`, `refresh_tokens`, `reset_password`, `profile_views`.

- **User 1:1 Profile** — each user has one profile
- **Profile 1:N Components** — ordered sections with JSONB metadata
- **Profile 1:N ProfileViews** — IP-deduplicated view tracking
- **Soft deletes** on `users` and `profiles`

## CI/CD

GitHub Actions workflows:

- **CI** (`ci.yml`): Lint → migration check → test → build
- **CD** (`deploy.yml`): SCP + SSH deploy to staging/production via PM2

## Cron Jobs

- **Daily midnight**: Deletes unverified accounts older than 30 days (`StaleUsersCleanupService`).
