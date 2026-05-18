# Analytics Module — Profile View Tracking

Adds a `POST /analytics/view` endpoint that records profile views with IP-based deduplication.

## Endpoint

### `POST /analytics/view`

Records a view for a given profile. Public endpoint, rate-limited to 30 requests per minute.

**Request body:**

```json
{
  "profileId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Responses:**

| Status | Description         |
| ------ | ------------------- |
| 201    | View recorded       |
| 422    | Invalid profile ID  |
| 404    | Profile not found   |
| 429    | Rate limit exceeded |

## How it works

1. Validates the profile exists in the database (returns 404 if not).
2. Extracts the viewer's IP from the `x-forwarded-for` header (falls back to `req.socket.remoteAddress`).
3. Extracts the `user-agent` from the request headers.
4. Checks for a duplicate view from the same IP to the same profile within the last 5 minutes — if found, skips recording (deduplication).
5. Inserts a row in `profile_views` with `profileId`, `viewerIp`, `userAgent`, and `viewedAt`.

## Schema

Relies on the existing `profile_views` table:

| Column    | Type        | Description                   |
| --------- | ----------- | ----------------------------- |
| id        | UUID        | Primary key                   |
| profileId | UUID        | FK to profiles                |
| viewerIp  | varchar     | Viewer's IP address           |
| userAgent | text        | Browser user-agent (nullable) |
| viewedAt  | timestamptz | Timestamp of the view         |

## Rate limiting

- **30 requests per 60 seconds** per IP (configurable via `@Throttle` decorator)
- Uses the global `ThrottlerGuard` from `@nestjs/throttler`

## Tests

```bash
# unit & integration
npm test

# specific file
npx jest src/modules/analytics
```
