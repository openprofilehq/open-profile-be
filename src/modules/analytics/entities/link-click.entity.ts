import { Entity, PrimaryColumn, Column, Index, BeforeInsert } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { LinkType } from '../dto/profile-event-job.dto';

@Entity('link_clicks')
@Index('idx_lc_profile_occurred', ['profileId', 'occurredAt'])
export class LinkClick {
    @PrimaryColumn('uuid') id: string;
    @BeforeInsert() generateId() { if (!this.id) this.id = uuidv7(); }

    @Column({ name: 'profile_id', type: 'uuid' }) profileId: string;
    @Column({ name: 'link_type', type: 'varchar', length: 32 }) linkType: LinkType;
    @Column({ name: 'target_id', type: 'uuid' }) targetId: string;
    @Column({ name: 'visitor_fp', type: 'varchar', length: 64 }) visitorFp: string;
    @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    occurredAt: Date;
}