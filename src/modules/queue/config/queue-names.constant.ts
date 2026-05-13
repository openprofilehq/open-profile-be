export const QUEUE_NAMES = {
  EMAIL: 'email',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const QUEUE_JOB_NAMES = {
  EMAIL: {
    SEND_PASSWORD_RESET: 'send-password-reset',
    SEND_PASSWORD_CHANGED: 'send-password-changed',
    VERIFY_EMAIL: 'verify-email',
    WAITLIST: 'waitlist',
    ACCOUNT_LOCKED: 'account-locked',
    NEW_IP_LOGIN: 'new-ip-login',
    SEND_OTP: 'send-otp',
  },
} as const;

export type QueueJobName =
  (typeof QUEUE_JOB_NAMES)[keyof typeof QUEUE_JOB_NAMES][keyof (typeof QUEUE_JOB_NAMES)[keyof typeof QUEUE_JOB_NAMES]];
