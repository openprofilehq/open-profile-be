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

# Auth Bug Fix — JWT Session Refresh

## Problem

After the access token expired (15 minutes), the server was failing to use the
refresh token to issue new tokens silently. This caused users to be logged out
every 15 minutes despite having a valid 7-day refresh token.

---

## Root Cause

The `refresh_tokens` table had a `device_id` column used to look up token
records during rotation:

```typescript
// Before — looked up by deviceId
const record = await this.refreshTokenRepo.findOne({
  where: { deviceId },
  relations: ['user'],
});
```

The `deviceId` was derived from the user-agent header — not unique per session:

```typescript
const ua = (req.headers?.['user-agent'] as string) ?? 'unknown';
return Buffer.from(ua).toString('base64').slice(0, 36);
```

This meant two users on the same browser and machine produced the same
`deviceId`. When the wrong record was found, `argon2.verify` failed against the
mismatched hash, throwing `UnauthorizedException` and logging the user out.

---

## Fix

The reviewer's guidance: each session already has its own unique refresh token.
There is no need to tie a token to a device — the token itself is the
identifier. Look up by hash, not by `deviceId`.

### What changed

**`token.service.ts`**

- `generateRefreshToken(userId)` — removed `deviceId` parameter. Each login
  creates a new row identified purely by its hashed token value.
- `rotateTokens(rawRefreshToken)` — removed `deviceId` parameter. Loads all
  records and verifies hash to find the matching session.
- `invalidateRefreshToken(rawRefreshToken)` — now takes the raw token instead
  of `userId + deviceId`. Finds and deletes the matching record by hash.
- Removed `extractDeviceId()`, `setDeviceIdCookie()`, and all `deviceId`-related
  constants.

**`auth.service.ts`**

- `login()`, `verifyOtp()`, `loginGoogle()` — no longer compute or pass
  `deviceId` when issuing tokens.
- `refreshTokens()` — passes only `rawRefreshToken` to `rotateTokens`.
- `logout()` — passes `rawRefreshToken` to `invalidateRefreshToken` instead of
  `userId + deviceId`.
- Removed `GoogleAuthResponse.deviceId` from the interface.

**`jwt-auth.guard.ts`**

- `attemptRefresh()` — removed `extractDeviceId` call and `deviceId` argument
  from `rotateTokens`.

**`refresh-token.entity.ts`**

- Removed `deviceId` column.

**Database**

- `device_id` column dropped directly:
  ```sql
  ALTER TABLE refresh_tokens DROP COLUMN device_id;
  ```
  No migration file — the column was dropped in place to avoid unnecessary
  migration overhead as advised by the reviewer.

---

## Session Model (After Fix)

Each login creates one row in `refresh_tokens`:

| Column       | Description                          |
| ------------ | ------------------------------------ |
| `id`         | UUID primary key                     |
| `user_id`    | Owner of the session                 |
| `token_hash` | Argon2 hash of the raw refresh token |
| `expires_at` | 7 days from creation                 |
| `created_at` | Timestamp                            |

A user can have multiple active rows (multiple sessions across devices). Each
session is independent — logout deletes that session's row by matching the hash.
No device tracking needed.

---

## Files Changed

| File                                                | Change                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/modules/auth/services/token.service.ts`        | Removed `deviceId` throughout, rewrote `rotateTokens` and `invalidateRefreshToken` |
| `src/modules/auth/auth.service.ts`                  | Removed `deviceId` from all auth flows                                             |
| `src/modules/auth/guards/jwt-auth.guard.ts`         | Removed `extractDeviceId` and `deviceId` from `attemptRefresh`                     |
| `src/modules/auth/entities/refresh-token.entity.ts` | Removed `deviceId` column                                                          |

---

## Test Results

```
[23:51:04] Login: userId=cf326350...          ← logged in
[00:08:01] Token refresh succeeded [no_access_token]  ← 17 min later, silently refreshed ✅
```

Access token expired after 15 minutes. The guard detected no access token,
used the refresh token cookie to rotate tokens silently, and the request
completed successfully — no re-login required.
