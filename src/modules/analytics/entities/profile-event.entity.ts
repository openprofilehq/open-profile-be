import { Entity, PrimaryColumn, Column, Index, BeforeInsert } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { EventType } from '../dto/profile-event-job.dto';

@Entity('profile_events')
@Index('idx_pe_profile_occurred', ['profileId', 'occurredAt'])
@Index('idx_pe_visitor_fp', ['visitorFp'])
export class ProfileEvent {
    @PrimaryColumn('uuid') id: string;
    @BeforeInsert() generateId() { if (!this.id) this.id = uuidv7(); }

    @Column({ name: 'profile_id', type: 'uuid' }) profileId: string;
    @Column({ type: 'varchar', length: 32 }) eventType: EventType;
    @Column({ name: 'visitor_fp', type: 'varchar', length: 64 }) visitorFp: string;
    @Column({ name: 'viewer_id', type: 'uuid', nullable: true }) viewerId: string | null;
    @Column({ type: 'jsonb', nullable: true, default: {} }) metadata: Record<string, unknown>;
    @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    occurredAt: Date;
}