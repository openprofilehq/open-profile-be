import { UserStatus } from '../../users/entities/user.entity';

export enum UserStatusAction {
  BLOCK = 'block',
  SUSPEND = 'suspend',
  DEACTIVATE = 'deactivate',
  REACTIVATE = 'reactivate',
  FLAG_FOR_REVIEW = 'flag_for_review',
}

export interface StatusTransition {
  target: UserStatus;
  allowedFrom: UserStatus[];
}

export const STATUS_TRANSITIONS: Record<UserStatusAction, StatusTransition> = {
  [UserStatusAction.BLOCK]: {
    target: UserStatus.BLOCKED,
    allowedFrom: [
      UserStatus.ACTIVE,
      UserStatus.SUSPENDED,
      UserStatus.FLAGGED_FOR_REVIEW,
    ],
  },
  [UserStatusAction.SUSPEND]: {
    target: UserStatus.SUSPENDED,
    allowedFrom: [UserStatus.ACTIVE, UserStatus.FLAGGED_FOR_REVIEW],
  },
  [UserStatusAction.DEACTIVATE]: {
    target: UserStatus.DEACTIVATED,
    allowedFrom: [
      UserStatus.ACTIVE,
      UserStatus.BLOCKED,
      UserStatus.SUSPENDED,
      UserStatus.FLAGGED_FOR_REVIEW,
    ],
  },
  [UserStatusAction.REACTIVATE]: {
    target: UserStatus.ACTIVE,
    allowedFrom: [
      UserStatus.BLOCKED,
      UserStatus.SUSPENDED,
      UserStatus.DEACTIVATED,
      UserStatus.FLAGGED_FOR_REVIEW,
    ],
  },
  [UserStatusAction.FLAG_FOR_REVIEW]: {
    target: UserStatus.FLAGGED_FOR_REVIEW,
    allowedFrom: [UserStatus.ACTIVE, UserStatus.SUSPENDED],
  },
};
