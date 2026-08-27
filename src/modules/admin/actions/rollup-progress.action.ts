import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RollupProgress,
  ROLLUP_PROGRESS_ID,
} from '../entities/rollup-progress.entity';

const UPSERT_DAILY_SQL = `
  INSERT INTO rollup_progress ("id", "lastDailyRollupAt") VALUES ($1, $2)
  ON CONFLICT ("id") DO UPDATE SET "lastDailyRollupAt" = EXCLUDED."lastDailyRollupAt", "updatedAt" = now()
`;

@Injectable()
export class RollupProgressAction extends AbstractModelAction<RollupProgress> {
  constructor(
    @InjectRepository(RollupProgress)
    repo: Repository<RollupProgress>,
  ) {
    super(repo, RollupProgress);
  }

  async getProgress(): Promise<RollupProgress | null> {
    return this.repository.findOne({ where: { id: ROLLUP_PROGRESS_ID } });
  }

  async setDailyProgress(at: Date): Promise<void> {
    await this.repository.query(UPSERT_DAILY_SQL, [ROLLUP_PROGRESS_ID, at]);
  }
}
