## Analytics v2 + Profile Content — Dev B

### New endpoints

| Method | Path                      | Auth   | Description                                              |
| ------ | ------------------------- | ------ | -------------------------------------------------------- |
| POST   | `/api/analytics/events`   | Public | Fire-and-forget event ingestion, returns 202             |
| GET    | `/api/analytics/insights` | JWT    | Pre-rolled metric snapshots (`?period=day\|week\|month`) |
| PATCH  | `/api/profiles/content`   | JWT    | Save full profile content in one call                    |

### Deprecated (still working)

- `POST /api/analytics/view` → use `/api/analytics/events`
- `GET /api/analytics/stats` → use `/api/analytics/insights`

### New files

- `src/common/fingerprint/` — SHA-256 visitor fingerprint service
- `src/modules/analytics/dto/create-event.dto.ts`
- `src/modules/analytics/dto/insights-query.dto.ts`
- `src/modules/profile/dto/save-profile-content.dto.ts`
- `src/database/migrations/1779100000000-AddContentToProfile.ts`

### Notes

- Fingerprint = SHA-256(`ip|user-agent|x-visitor-tz`). Frontend should send `X-Visitor-Tz` header.
- Profile content is a full replace, not a merge. Previous content is overwritten on every save.
- Saved content is not visible to visitors until `POST /api/profiles/publish` is called.
- Bull queue (`analytics`) inherits Redis config from `QueueModule`.
