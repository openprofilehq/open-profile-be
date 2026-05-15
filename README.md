# Open Profile BE

A production-ready NestJS 11 starter with PostgreSQL, JWT auth, the repository pattern via [`@hng-sdk/orm`](https://www.npmjs.com/package/@hng-sdk/orm), and migrations out of the box.

## Stack

- **Runtime**: NestJS 11 + TypeScript 5
- **Database**: PostgreSQL via TypeORM (accessed through `@hng-sdk/orm`'s `AbstractModelAction` repository pattern)
- **Auth**: JWT access + refresh tokens (`@nestjs/jwt` + Passport)
- **Validation**: `class-validator` + `class-transformer` for HTTP DTOs
- **Env validation**: [`@t3-oss/env-core`](https://env.t3.gg) + Zod (fail-fast on missing/invalid env vars)
- **Docs**: Swagger at `/docs`
- **Hardening**: Helmet, compression, CORS, global exception filter, response envelope

## Prerequisites

- Node.js 20+
- pnpm (or npm/yarn — adjust commands accordingly)
- A running PostgreSQL 14+ instance

## Quick start

```bash
# 1. Install
pnpm install

# 2. Configure
cp .env.example .env
# edit .env with your DB credentials and at least 32-char JWT secrets

# 3. Create the database (one-time)
createdb nestjs_starter   # or your preferred client

# 4. Apply migrations
pnpm migration:run

# 5. (optional) Seed an admin user
pnpm seed
# creates admin@example.com / Admin@123456

# 6. Run
pnpm start:dev
```

Open `http://localhost:3000/docs` for the Swagger UI. All API routes are versioned under `/api/v1/`.

## Scripts

### App

| Script             | Purpose                         |
| ------------------ | ------------------------------- |
| `pnpm start:dev`   | Run with watch mode             |
| `pnpm start:debug` | Run with `--inspect` debugger   |
| `pnpm start:prod`  | Run the compiled `dist/main.js` |
| `pnpm build`       | Compile to `dist/`              |
| `pnpm lint`        | Lint and auto-fix               |
| `pnpm format`      | Prettier                        |
| `pnpm test`        | Unit tests                      |
| `pnpm test:e2e`    | End-to-end tests                |
| `pnpm test:cov`    | Coverage report                 |

### Database

| Script                                                   | Purpose                                      |
| -------------------------------------------------------- | -------------------------------------------- |
| `pnpm migration:run`                                     | Apply all pending migrations                 |
| `pnpm migration:revert`                                  | Revert the most recent migration             |
| `pnpm migration:show`                                    | List migrations and their status             |
| `pnpm migration:generate src/database/migrations/<Name>` | Diff entities vs DB and generate a migration |
| `pnpm migration:create src/database/migrations/<Name>`   | Create an empty migration                    |
| `pnpm schema:drop`                                       | Drop all tables (destructive — dev only)     |
| `pnpm seed`                                              | Run all seeders                              |
| `pnpm db:reset`                                          | Drop schema, run migrations, run seeders     |

> The `migration:generate` script requires a live database connection so TypeORM can diff against the current schema.

## Folder structure

```
src/
├── common/                 # cross-cutting: decorators, filters, interceptors
│   ├── decorators/         # @Public(), @CurrentUser()
│   ├── filters/            # global HttpExceptionFilter
│   └── interceptors/       # logging + response envelope
├── config/                 # env (t3-env), app/database/jwt config
├── database/
│   ├── data-source.ts      # TypeORM CLI DataSource
│   ├── migrations/
│   └── seeds/
├── modules/
│   ├── auth/               # /api/v1/auth/register, /login, /refresh, /logout, /me
│   ├── health/             # /api/v1/health (public)
│   ├── mail/               # nodemailer sender + queue worker for emails
│   ├── queue/              # BullMQ root config + shared queue service
│   ├── search/             # GET /api/v1/search — trigram profile search
│   ├── usernames/          # GET /api/v1/usernames/check — availability check
│   └── users/              # CRUD example using the repository pattern
│       ├── actions/        # UserModelAction extends AbstractModelAction<User>
│       ├── dto/
│       └── entities/
├── app.module.ts
└── main.ts
```

## Architecture

### Repository pattern via `@hng-sdk/orm`

Services never depend on TypeORM `Repository<T>` directly. Instead, each entity gets a `*ModelAction` class that extends `AbstractModelAction<T>` and exposes a uniform CRUD API (`create`, `get`, `find`, `list`, `update`, `delete`, `save`) plus any domain-specific helpers.

```ts
// modules/users/actions/user.action.ts
@Injectable()
export class UserModelAction extends AbstractModelAction<User> {
  constructor(@InjectRepository(User) repository: Repository<User>) {
    super(repository, User);
  }

  findByEmail(email: string) {
    return this.get({ identifierOptions: { email } });
  }
}
```

```ts
// modules/users/users.service.ts
@Injectable()
export class UsersService {
  constructor(private readonly userModelAction: UserModelAction) {}

  findOne(id: string) {
    return this.userModelAction.get({ identifierOptions: { id } });
  }
}
```

### Adding a new module

1. Create `src/modules/<name>/`
2. Define the entity in `entities/<name>.entity.ts`
3. Create the model action in `actions/<name>.action.ts`
4. Implement service and controller
5. Wire up the module: `imports: [TypeOrmModule.forFeature([Entity])]`, providers include the model action
6. Register the module in `AppModule.imports`
7. Generate a migration: `pnpm migration:generate src/database/migrations/Add<Name>`
8. Apply it: `pnpm migration:run`

### Env validation

`src/config/env.ts` uses `@t3-oss/env-core` with Zod. The app fails to boot with a readable error if any required variable is missing or invalid. Import the typed `env` object instead of reaching into `process.env`:

```ts
import { env } from './config/env';
const port = env.PORT; // typed as number
```

### Auth flow

| Endpoint                | Method | Auth   | Purpose                                         |
| ----------------------- | ------ | ------ | ----------------------------------------------- |
| `/api/v1/auth/register` | POST   | public | Create account, returns access + refresh tokens |
| `/api/v1/auth/login`    | POST   | public | Returns access + refresh tokens                 |
| `/api/v1/auth/refresh`  | POST   | public | Issue a new access token from a refresh token   |
| `/api/v1/auth/logout`   | POST   | bearer | Revoke the current refresh token                |
| `/api/v1/auth/me`       | GET    | bearer | Return current user                             |

The global `JwtAuthGuard` protects every route by default. Decorate handlers (or controllers) with `@Public()` to opt out.

### Queue-to-mail flow

This project uses BullMQ as the background job layer and Nodemailer as the mail sender:

1. A service such as `AuthService` creates a payload for the email job.
2. The service calls `QueueService.addJob(...)` with `QUEUE_NAMES.EMAIL` and `QUEUE_JOB_NAMES.EMAIL.SEND_PASSWORD_RESET`.
3. BullMQ stores the job in Redis using the settings from `src/modules/queue/config/bull.config.ts`.
4. `MailProcessor` consumes the job and hands the payload to `MailService`.
5. `MailService` sends the actual email through Nodemailer.

Example enqueue call from a domain service:

```ts
await this.queueService.addJob(
  QUEUE_NAMES.EMAIL,
  QUEUE_JOB_NAMES.EMAIL.SEND_PASSWORD_RESET,
  {
    to: user.email,
    resetLink: `${env.APP_URL}/reset-password?token=${rawToken}`,
  },
  {
    jobId: `user-${user.id}`,
  },
);
```

Example processor behavior:

```ts
@Processor(QUEUE_NAMES.EMAIL)
export class MailProcessor extends WorkerHost {
  async process(job: Job) {
    switch (job.name) {
      case QUEUE_JOB_NAMES.EMAIL.SEND_PASSWORD_RESET:
        await this.mailService.sendEmail(
          job.data.to,
          'Password Reset Request',
          resetPasswordEmailTemplate({ resetUrl: job.data.resetLink }),
        );
        break;
    }
  }
}
```

Example mail sender behavior:

```ts
await this.transporter.sendMail({
  from: env.MAIL_FROM,
  to,
  subject,
  html,
});
```

Required env vars for mail:

- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_USER`
- `MAIL_PASS`
- `MAIL_FROM`
- `APP_URL`
- `REDIS_URL`

Recommended responsibilities:

- `QueueModule`: registers BullMQ once and owns Redis connection defaults.
- `MailModule`: owns mail config, the Nodemailer sender, and the worker processor.
- `AuthService` or any domain service: enqueues the email job.
- `MailProcessor`: turns the queued job into a sent email.

### Response envelope

`TransformInterceptor` wraps successful responses:

```json
{
  "success": true,
  "data": { ... }
}
```

For paginated responses, `paginationMeta` from `@hng-sdk/orm` is hoisted into `meta`.

Errors go through `HttpExceptionFilter`:

```json
{
  "success": false,
  "statusCode": 400,
  "error": "BadRequestException",
  "message": ["email must be an email"],
  "path": "/api/v1/users",
  "timestamp": "2026-04-28T12:34:56.000Z"
}
```

## Environment variables

See `.env.example` for the full list. Critical ones:

| Variable             | Notes                                                      |
| -------------------- | ---------------------------------------------------------- |
| `DATABASE_*`         | host/port/user/password/name                               |
| `DATABASE_SYNC`      | **Always `false` in non-dev** — use migrations             |
| `DATABASE_SSL`       | `true` for managed providers (Neon, Supabase, RDS)         |
| `JWT_ACCESS_SECRET`  | Min 32 chars                                               |
| `JWT_REFRESH_SECRET` | Min 32 chars, must differ from access secret               |
| `SWAGGER_ENABLED`    | Set to `false` in production if you don't want public docs |
| `MAIL_HOST`          | SMTP host used by Nodemailer                               |
| `MAIL_PORT`          | SMTP port, usually `587` or `465`                          |
| `MAIL_USER`          | SMTP username                                              |
| `MAIL_PASS`          | SMTP password                                              |
| `MAIL_FROM`          | Default sender address                                     |
| `APP_URL`            | Used to build password reset links                         |
| `REDIS_URL`          | Redis connection string used by BullMQ                     |

## License

UNLICENSED

---

# Usernames Feature

## Overview

Availability checking for user-chosen profile usernames. The feature enforces strict validation rules (format, length, reserved words, homoglyph protection) and is rate-limited to prevent abuse.

---

## Endpoints

### `GET /api/v1/usernames/check` (Public, Rate-Limited)

| Attribute   | Value                                     |
| ----------- | ----------------------------------------- |
| Auth        | None (public)                             |
| Rate limit  | 60 req/min/IP (Redis, in-memory fallback) |
| Query param | `username` (string, required)             |

**Success `200`:**

```json
{
  "available": true,
  "username": "normalized-username"
}
```

**Taken `409`:**

```json
{
  "statusCode": 409,
  "error": "USERNAME_TAKEN",
  "message": "Username is already taken"
}
```

**Invalid `400`:**

```json
{
  "statusCode": 400,
  "error": "INVALID_FORMAT",
  "message": "Username must be 3-30 characters, only lowercase letters, digits, and hyphens"
}
```

### `GET /api/v1/usernames/check/internal` (Authenticated, No Rate Limit)

Same behavior as the public endpoint but requires a Bearer JWT and bypasses the rate-limit guard. Useful for server-to-server checks.

---

## Validation Rules

| Rule                    | Detail                                               |
| ----------------------- | ---------------------------------------------------- |
| Min length              | 3 characters                                         |
| Max length              | 30 characters                                        |
| Allowed chars           | `a-z`, `0-9`, hyphens (`-`)                          |
| Leading/trailing hyphen | Not allowed                                          |
| Consecutive hyphens     | Not allowed (e.g. `co--ol`)                          |
| Ambiguous unicode       | Cyrillic, Greek, CJK blocked                         |
| Reserved names          | ~50 reserved keywords (`admin`, `api`, `test`, etc.) |
| Uniqueness              | Must not exist in `users` table                      |

---

## Rate Limiting

| Header                  | Value        |
| ----------------------- | ------------ |
| `x-ratelimit-limit`     | 60           |
| `x-ratelimit-remaining` | 59 (example) |
| `x-ratelimit-reset`     | 60 (seconds) |

If Redis is unreachable, falls back to an in-memory store with a 10 req/min/IP limit.

---

## Architecture

```
Controller  (GET /api/v1/usernames/check)
```

### Files

| File                                                        | Responsibility                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `src/modules/usernames/usernames.controller.ts`             | Routes, public decorator, rate-limit guard                 |
| `src/modules/usernames/usernames.service.ts`                | Core logic: normalization, validation, DB uniqueness check |
| `src/modules/usernames/dto/check-username.dto.ts`           | Validates the `username` query parameter                   |
| `src/modules/usernames/guards/username-rate-limit.guard.ts` | Redis-backed rate limiter with in-memory fallback          |
| `src/modules/usernames/data/reserved-keywords.ts`           | Set of ~50 reserved usernames                              |
| `src/modules/usernames/username.service.spec.ts`            | Unit tests                                                 |

---

## Example Request

```bash
curl -X GET 'http://localhost:3000/api/v1/usernames/check?username=adebayo'
```

### Response

```json
{
  "available": true,
  "username": "adebayo"
}
```

---

## Database

Username lives on the `users` table as `varchar(30)`, nullable and uniquely indexed:

| Column     | Type        | Default |
| ---------- | ----------- | ------- |
| `username` | varchar(30) | null    |

```sql
CREATE UNIQUE INDEX users_username_unique_idx ON users (username) WHERE username IS NOT NULL;
```

---

# Search Feature

## Overview

Public profile search endpoint that allows visitors to find published user profiles by full name or username using PostgreSQL `pg_trgm` trigram similarity matching.

---

## Endpoint

```
GET /api/v1/search?q={query}
```

- Publicly accessible — no authentication required
- Rate limited to 60 requests per minute per IP

---

## Query Parameter

| Parameter | Type   | Required | Description                                               |
| --------- | ------ | -------- | --------------------------------------------------------- |
| `q`       | string | Yes      | Search term. Minimum 2 characters, maximum 100 characters |

---

## Response

### Success `200`

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "username": "adebayo",
        "fullName": "Adebayo Johnson",
        "bio": "Backend engineer and product builder.",
        "photoUrl": "https://example.com/adebayo.jpg",
        "isVerified": false
      }
    ],
    "total": 1
  }
}
```

### Result shape per item

| Field        | Type           | Description                         |
| ------------ | -------------- | ----------------------------------- |
| `username`   | string         | Unique profile username             |
| `fullName`   | string         | Full display name                   |
| `bio`        | string or null | Profile bio, truncated to 120 chars |
| `photoUrl`   | string or null | Profile photo URL                   |
| `isVerified` | boolean        | Whether the profile is verified     |

### Empty results `200`

```json
{
  "success": true,
  "data": {
    "results": [],
    "total": 0
  }
}
```

Frontend handles the empty state UI.

### Validation error `400`

Returned when `q` is missing, under 2 characters, or blank after trimming.

```json
{
  "success": false,
  "error": "Please enter at least 2 characters to search."
}
```

---

## Search Logic

- Uses PostgreSQL `pg_trgm` trigram similarity across `full_name` and `username` columns
- Case-insensitive matching
- Partial matches supported — e.g. searching `ade` returns `Adebayo`, `Adeola`, etc.
- Only profiles where `is_published = true` are included
- Soft-deleted profiles (`deleted_at IS NOT NULL`) are excluded
- Results ordered by similarity score descending — most relevant first
- Exact `username` matches are boosted above partial matches
- Maximum 20 results returned per query

---

## Rate Limiting

| Header                  | Value        |
| ----------------------- | ------------ |
| `x-ratelimit-limit`     | 60           |
| `x-ratelimit-remaining` | 59 (example) |
| `x-ratelimit-reset`     | 60 (seconds) |

---

## Architecture

```
Controller  (GET /api/v1/search)
    ↓
SearchService  (input validation + orchestration)
    ↓
SearchAction  (DB query logic — pg_trgm)
    ↓
TypeORM → PostgreSQL
```

### Files

| File                                                              | Responsibility                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| `src/modules/search/search.controller.ts`                         | Route, public decorator, throttle guard               |
| `src/modules/search/search.service.ts`                            | Validates input, calls action, formats response       |
| `src/modules/search/actions/search.action.ts`                     | All DB logic — trigram query, ordering, limit         |
| `src/modules/search/dto/search-query.dto.ts`                      | Validates and transforms `q`                          |
| `src/modules/search/search.module.ts`                             | Module wiring                                         |
| `src/database/migrations/1778520370661-AddProfileSearchFields.ts` | Adds columns, installs `pg_trgm`, creates GIN indexes |

---

## Database Migration

Adds the following to the `users` table:

| Column         | Type         | Default |
| -------------- | ------------ | ------- |
| `username`     | varchar(100) | null    |
| `bio`          | text         | null    |
| `photo_url`    | varchar(500) | null    |
| `is_published` | boolean      | false   |

### Indexes created

```sql
-- Trigram indexes for similarity search
CREATE INDEX users_full_name_trgm_idx ON users USING GIN (full_name gin_trgm_ops);
CREATE INDEX users_username_trgm_idx  ON users USING GIN (username gin_trgm_ops);

-- Unique index on username
CREATE UNIQUE INDEX users_username_unique_idx ON users (username) WHERE username IS NOT NULL;
```

---

## Example Request

```bash
curl -X GET 'http://localhost:3000/api/v1/search?q=ade' \
```

### Response

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "username": "adebayo",
        "fullName": "Adebayo Johnson",
        "bio": "Backend engineer and product builder.",
        "photoUrl": "https://example.com/adebayo.jpg",
        "isVerified": false
      }
    ],
    "total": 1
  }
}
```

---

## Validation

- `pnpm build` — passed
- `pnpm test` — passed
- Live: `GET /api/v1/search?q=ade` returns correct shape with rate limit headers

//
arkdown# BE-AUTH-006 — Token & Session Management

## Overview

Implements JWT-based session management for all protected routes. Includes a global auth guard, silent token refresh, token rotation, and secure logout — ensuring logged-in users never experience unexpected 401s during an active session.

---

## What Was Built

### 1. Global JWT Auth Guard

`src/modules/auth/guards/jwt-auth.guard.ts`

Applies to every protected route automatically via `APP_GUARD` in `AppModule`. On each request it:

- Extracts the `accessToken` from the `httpOnly` cookie
- Verifies the token signature and expiry
- Returns `401 SESSION_EXPIRED` if missing, expired, or tampered
- Triggers silent refresh if token has less than 3 minutes remaining

### 2. Token Service

`src/modules/auth/services/token.service.ts`

Centralises all token logic:

- `generateAccessToken` — signs JWT with 15 min expiry
- `generateRefreshToken` — generates UUID, hashes with argon2, stores per device in DB
- `rotateTokens` — validates old token, issues new pair, invalidates old record
- `invalidateRefreshToken` — deletes single device record (logout)
- `invalidateAllRefreshTokens` — deletes all device records (password reset)
- `setTokenCookies` — sets both cookies as `httpOnly`, `Secure`, `SameSite=Strict`
- `clearTokenCookies` — clears both cookies with `Max-Age=0`
- `needsSilentRefresh` — returns true if token TTL < 3 minutes

### 3. Redis Lock Service

`src/modules/auth/services/redis-lock.service.ts`

Prevents race conditions when two simultaneous requests near token expiry both attempt refresh. Uses Redis `SET NX EX` (atomic) with a 5-second TTL lock per user.

### 4. Refresh Token Entity

`src/modules/auth/entities/refresh-token.entity.ts`

Stores per-device refresh token records in the `refresh_tokens` table:

| Column     | Type         | Description                          |
| ---------- | ------------ | ------------------------------------ |
| id         | uuid         | Primary key                          |
| user_id    | uuid         | Foreign key → users (CASCADE DELETE) |
| device_id  | varchar(36)  | Identifies the device/session        |
| token_hash | varchar(500) | argon2 hash of raw token             |
| expires_at | timestamptz  | Token expiry                         |
| created_at | timestamp    | Record creation time                 |

### 5. Endpoints

#### `POST /api/v1/auth/refresh-token`

- Reads `refreshToken` from httpOnly cookie
- Validates against stored hash in DB
- On success: issues new access + refresh token pair (rotation), sets new cookies
- On failure: clears both cookies, returns `401 SESSION_EXPIRED`

#### `POST /api/v1/auth/logout`

- Reads `accessToken` from cookie (accepts expired tokens)
- Deletes refresh token record for this device only
- Clears both cookies with `Max-Age=0`
- Returns `200` with logout message regardless of token state

---

## Silent Refresh

The guard proactively refreshes tokens without any client-side action:
Incoming request
↓
Extract accessToken cookie
↓
Verify token
↓
TTL < 3 minutes?
├── YES → Acquire Redis lock → Rotate tokens → Set new cookies → Continue request
└── NO → Continue request as normal

The client receives a fresh `accessToken` cookie in the response headers automatically.

---

## Token Rotation

Every refresh (silent or explicit) issues a new refresh token and invalidates the old one. Reusing an old refresh token returns `401` and clears all cookies.

---

## Per-Device Sessions

Each login creates a separate record in `refresh_tokens` identified by `device_id` (derived from `User-Agent`). Logging out on one device only deletes that device's record — other sessions remain active.

---

## Migrations

Two migrations were added:

| Migration                                     | Description                                             |
| --------------------------------------------- | ------------------------------------------------------- |
| `1778712403563-CreateRefreshTokensTable`      | Creates `refresh_tokens` table with FK to users         |
| `1778754115312-DropRefreshTokenHashFromUsers` | Removes legacy `refresh_token_hash` column from `users` |

Run migrations:

```bash
pnpm migration:run
```

---

## Files Changed

### New

- `src/modules/auth/entities/refresh-token.entity.ts`
- `src/modules/auth/services/token.service.ts`
- `src/modules/auth/services/redis-lock.service.ts`
- `src/database/migrations/1778712403563-CreateRefreshTokensTable.ts`
- `src/database/migrations/1778754115312-DropRefreshTokenHashFromUsers.ts`

### Modified

- `src/modules/auth/guards/jwt-auth.guard.ts` — added silent refresh logic
- `src/modules/auth/auth.service.ts` — updated login, logout, refresh, verifyOtp, loginGoogle
- `src/modules/auth/auth.controller.ts` — updated refresh and logout endpoints
- `src/modules/auth/auth.module.ts` — registered new services and entity
- `src/modules/auth/strategies/jwt.strategy.ts` — fixed cookie name to `accessToken`
- `src/modules/users/users.service.ts` — removed `setRefreshTokenHash` method
- `src/main.ts` — added `cookie-parser` middleware

---

## Environment Variables

No new variables required. Existing variables used:

```dotenv
JWT_ACCESS_SECRET=        # Access token signing secret
JWT_ACCESS_EXPIRES_IN=15m # Access token expiry (default: 15 minutes)
JWT_REFRESH_SECRET=       # Refresh token signing secret
JWT_REFRESH_EXPIRES_IN=7d # Refresh token expiry (default: 7 days)
REDIS_URL=                # Redis connection URL
```

---

## Edge Cases Handled

| Case                                  | Behaviour                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| Logout with expired access token      | Extracts userId with `ignoreExpiration: true`, still clears cookies, returns 200 |
| Two simultaneous requests near expiry | Redis lock prevents duplicate token generation                                   |
| Password reset                        | Invalidates all refresh tokens across all devices                                |
| Reused refresh token                  | 401 + cookies cleared immediately                                                |
| Tampered access token                 | 401 SESSION_EXPIRED                                                              |

---

## Testing

See test procedures in the ticket. All 9 acceptance criteria verified manually:
✅ POST /auth/refresh-token endpoint
✅ POST /auth/logout endpoint
✅ Global JwtAuthGuard on all protected routes
✅ 401 SESSION_EXPIRED on invalid/missing token
✅ Silent refresh when TTL < 3 minutes
✅ Refresh token validates against DB hash
✅ 401 + cookies cleared on invalid refresh token
✅ Logout clears cookies + deletes DB record
✅ Per-device logout isolation

//Dashboard

# BE-ONB-007 — Dashboard Profile Data Endpoint

## Overview

Authenticated endpoint that returns the full current profile state for the logged-in user. Unlike the public profile endpoint, this returns all components regardless of active state and reflects the live editing state including unpublished changes.

---

## Endpoint

```
GET /api/v1/profiles/dashboard
```

### Authentication

Requires a valid JWT access token. The global `JwtAuthGuard` protects this route automatically — no `@Public()` decorator means auth is enforced.

### Headers

| Header          | Value                   |
| --------------- | ----------------------- |
| `Authorization` | `Bearer <access_token>` |

---

## Responses

### 200 OK — Profile found

```json
{
  "success": true,
  "data": {
    "username": "johndoe",
    "fullName": "Jane Doe",
    "bio": "Software developer passionate about open source",
    "photoUrl": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    "templateType": null,
    "themeSettings": null,
    "isPublished": true,
    "hasUnpublishedChanges": false,
    "ctaLabel": null,
    "ctaUrl": null,
    "components": []
  }
}
```

### 401 Unauthorized — Missing or invalid token

```json
{
  "success": false,
  "statusCode": 401,
  "error": "Unauthorized"
}
```

### 404 Not Found — User has not completed onboarding

```json
{
  "success": false,
  "statusCode": 404,
  "error": "Not Found",
  "message": "Profile not found. Please complete your profile setup."
}
```

---

## Key Difference from Public Endpoint

|                         | `GET /profiles/:username` | `GET /profiles/dashboard`      |
| ----------------------- | ------------------------- | ------------------------------ |
| Auth required           | No                        | Yes                            |
| Components returned     | Active + has content only | All (including inactive/empty) |
| State reflected         | Last published snapshot   | Live current state             |
| `hasUnpublishedChanges` | Not included              | Included                       |
| Cached                  | Yes (Redis, 60s)          | No                             |

---

## Implementation

### Files changed

| File                                                            | Change                               |
| --------------------------------------------------------------- | ------------------------------------ |
| `src/modules/profile/profile.controller.ts`                     | Added `GET /dashboard` route         |
| `src/modules/profile/profile.service.ts`                        | Added `getDashboardProfile()` method |
| `src/modules/profile/entities/profile.entity.ts`                | Added `ctaLabel`, `ctaUrl` columns   |
| `src/database/migrations/AddCtaFieldsToProfile1778844521139.ts` | Migration for `cta_label`, `cta_url` |

### Controller

```typescript
@Get('dashboard')
@HttpCode(HttpStatus.OK)
@ApiBearerAuth()
@ApiOperation({ summary: 'Get full current profile data for the authenticated user' })
@ApiResponse({ status: 200, description: 'Profile returned successfully' })
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 404, description: 'Profile not found. Please complete your profile setup.' })
async getDashboardProfile(
  @currentUserDecorator.CurrentUser('sub') userId: string,
) {
  return this.profileService.getDashboardProfile(userId);
}
```

> Must be placed **above** `@Get(':username')` in the controller — NestJS matches routes top to bottom and `dashboard` would otherwise be captured as a `:username` param.

### Service

```typescript
async getDashboardProfile(userId: string): Promise<Record<string, unknown>> {
  const profile = await this.profileRepo.findOne({
    where: { userId, deletedAt: IsNull() },
  });

  if (!profile) {
    throw new NotFoundException(
      'Profile not found. Please complete your profile setup.',
    );
  }

  const components = await this.componentRepo.find({
    where: { profileId: profile.id },
    order: { displayOrder: 'ASC' },
  });

  return {
    username: profile.username,
    fullName: profile.fullName,
    bio: profile.bio,
    photoUrl: profile.photoUrl,
    templateType: profile.templateType,
    themeSettings: profile.themeSettings,
    isPublished: profile.isPublished,
    hasUnpublishedChanges: profile.hasUnpublishedChanges,
    ctaLabel: profile.ctaLabel,
    ctaUrl: profile.ctaUrl,
    components: components.map((c) => ({
      id: c.id,
      sectionType: c.sectionType,
      title: c.title,
      content: c.content,
      displayOrder: c.displayOrder,
      isEnabled: c.isEnabled,
      metadata: c.metadata,
    })),
  };
}
```

---

## Migration

`AddCtaFieldsToProfile1778844521139` adds `cta_label` and `cta_url` to the `profiles` table.

```bash
pnpm run migration:run
```

---

## Dependencies

- `POST /profiles` must have run successfully (profile must exist)
- `has_unpublished_changes` column — added in `UpdateProfileTable1778760000000`
- `cta_label`, `cta_url` columns — added in `AddCtaFieldsToProfile1778844521139`

---

## QA Checklist

- [x] Logged-in user with profile receives `200` with full profile data
- [x] Response includes `hasUnpublishedChanges` field
- [x] After editing profile, `hasUnpublishedChanges` returns `true`
- [x] After republishing, `hasUnpublishedChanges` returns `false`
- [x] All components returned including inactive/empty ones
- [x] User without a profile receives `404`
- [x] Unauthenticated request receives `401`
