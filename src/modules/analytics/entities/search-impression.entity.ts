import { Entity, PrimaryColumn, Column, Index, BeforeInsert } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

@Entity('search_impressions')
@Index('idx_si_profile_occurred', ['profileId', 'occurredAt'])
export class SearchImpression {
    @PrimaryColumn('uuid') id: string;
    @BeforeInsert() generateId() { if (!this.id) this.id = uuidv7(); }

    @Column({ name: 'profile_id', type: 'uuid' }) profileId: string;
    @Column({ type: 'varchar', length: 255 }) keyword: string;
    @Column({ type: 'int', nullable: true }) position: number | null;
    @Column({ name: 'visitor_fp', type: 'varchar', length: 64 }) visitorFp: string;
    @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    occurredAt: Date;
}