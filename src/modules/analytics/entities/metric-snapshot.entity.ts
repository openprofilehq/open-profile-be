import { Entity, PrimaryColumn, Column, Index, BeforeInsert } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { SnapshotBucket } from '../../../common/types/analytics.types';

@Entity('metric_snapshots')
@Index('idx_ms_profile_bucket_period', ['profileId', 'bucket', 'periodStart'], { unique: true })
export class MetricSnapshot {
    @PrimaryColumn('uuid') id: string;
    @BeforeInsert()
    generateId() {
        if (!this.id) this.id = uuidv7();
    }

    @Column({ name: 'profile_id', type: 'uuid' }) profileId: string;
    @Column({ type: 'varchar', length: 16 }) bucket: SnapshotBucket;
    @Column({ name: 'period_start', type: 'timestamptz' }) periodStart: Date;
    @Column({ name: 'views', type: 'int', default: 0 }) views: number;
    @Column({ name: 'unique_reach', type: 'int', default: 0 }) uniqueReach: number;
    @Column({ name: 'link_clicks', type: 'int', default: 0 }) linkClicks: number;
    @Column({ name: 'search_imps', type: 'int', default: 0 }) searchImpressions: number;
    @Column({ name: 'computed_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    computedAt: Date;
}