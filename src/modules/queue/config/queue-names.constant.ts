export const QUEUE_NAMES = {
  EMAIL: 'email',
  ANNOUNCEMENT: 'announcement-fanout',
  METRICS: 'metrics-rollup',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const QUEUE_JOB_NAMES = {
  EMAIL: {
    SEND_PASSWORD_RESET: 'send-password-reset',
    SEND_PASSWORD_CHANGED: 'send-password-changed',
    VERIFY_EMAIL: 'verify-email',
    WAITLIST: 'waitlist',
    SEND_WAITLIST_EMAIL: 'send-waitlist-email',
    ACCOUNT_LOCKED: 'account-locked',
    NEW_IP_LOGIN: 'new-ip-login',
    SEND_OTP: 'send-otp',
    SEND_NOTIFICATION_EMAIL: 'send-notification-email',
    SEND_INVITE_EMAIL: 'send-invite-email',
  },
  ANNOUNCEMENT: {
    FANOUT_BATCH: 'fanout-batch',
  },
  METRICS: {
    DAILY_ROLLUP: 'daily-rollup',
    BACKFILL: 'backfill',
    PLATFORM_SNAPSHOT: 'platform-snapshot',
  },
} as const;

export type QueueJobName = {
  [
    K in keyof typeof QUEUE_JOB_NAMES
  ]: (typeof QUEUE_JOB_NAMES)[K][keyof (typeof QUEUE_JOB_NAMES)[K]];
}[keyof typeof QUEUE_JOB_NAMES];
