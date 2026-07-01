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
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: EventType })
  eventType: EventType;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'uuid', nullable: true })
  profileId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  occurredAt: Date;
}
