import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum EventType {
  PROFILE_VIEWED = 'PROFILE_VIEWED',
  LINK_CLICKED = 'LINK_CLICKED',
  SEARCH_PERFORMED = 'SEARCH_PERFORMED',
}

@Entity('events')
@Index(['profileId', 'occurredAt'])
@Index(['eventType', 'occurredAt'])
@Index('IDX_events_anonymousId', ['anonymousId'])
@Index('IDX_events_profileId_eventType_occurredAt', [
  'profileId',
  'eventType',
  'occurredAt',
])
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: EventType })
  eventType: EventType;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  // Persistent identifier for unauthenticated visitors (UUID generated
  // client-side, stored in a cookie). Populated only when actorId is null.
  // On login/signup, past events matching this value get reassigned to
  // the real actorId — see the identity-merge logic.
  @Column({ type: 'varchar', nullable: true })
  anonymousId: string | null;

  @Column({ type: 'uuid', nullable: true })
  profileId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  occurredAt: Date;
}
