Auth Bug Fix — JWT Session Refresh
Problem

After the access token expired (15 minutes), the server was not consistently using the refresh token to silently issue new tokens. This caused users to be logged out despite having a valid 7-day refresh session.

Root Cause

The previous implementation introduced unnecessary session coupling via a deviceId, which was derived from the user-agent header:

const ua = (req.headers?.['user-agent'] as string) ?? 'unknown';
return Buffer.from(ua).toString('base64').slice(0, 36);

This approach was unreliable because:

It was not unique per session
Multiple sessions could resolve to the same identifier
It caused incorrect refresh token lookups and invalid rotations
Fix

The system was simplified to treat the refresh token itself as the session identifier.

Key changes

1. Refresh tokens are now self-contained session identifiers

Each login creates a unique refresh token (UUID). Only its hashed value is stored.

No deviceId
No device tracking
No secondary lookup key 2. Token rotation uses hash verification

During refresh, the system:

Loads refresh token records
Verifies the incoming raw token using argon2.verify
Identifies the matching session
Deletes the old session
Issues a new refresh token
const records = await repo.find({
relations: ['user'],
lock: { mode: 'pessimistic_write' },
});

let matchedRecord: RefreshToken | null = null;

for (const record of records) {
const isValid = await argon2.verify(record.tokenHash, rawRefreshToken);
if (isValid) {
matchedRecord = record;
break;
}
}

if (!matchedRecord) {
throw new UnauthorizedException({
error: 'SESSION_EXPIRED',
message: 'Your session has expired. Please log in again.',
});
} 3. Atomic session rotation

To prevent race conditions:

Rotation runs inside a DB transaction
Old refresh token is deleted before issuing a new one
New session record is created immediately after

This ensures only one valid session exists per refresh cycle.

4. Logout invalidation

Logout now invalidates sessions purely by matching the refresh token hash:

No user-agent dependency
No device mapping
Session Model (Current)
Column Description
id UUID primary key
userId Owner of session
tokenHash Argon2 hash of refresh token
expiresAt 7-day expiry timestamp
Behavior Summary
Each login creates a new refresh session
Multiple sessions per user are supported
Refresh rotation is stateless aside from DB records
Access tokens are short-lived (15 minutes)
Refresh tokens enable silent re-authentication
Database Change Note

The previous device_id approach has been fully removed from the system.

If deployed across multiple environments, ensure the schema is consistent with the updated refresh_tokens structure.

Result
Silent refresh works after access token expiry
No forced re-login at 15-minute intervals
Session handling is simplified and consistent
No device-based coupling or collision risk
