import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixStagingRollupProgressSchema1788530672320 implements MigrationInterface {
  name = 'FixStagingRollupProgressSchema1788530672320';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" DROP COLUMN IF EXISTS "lastHourlyRollupAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" ADD COLUMN IF NOT EXISTS "lastWeeklyRollupAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" ADD COLUMN IF NOT EXISTS "lastThirtyDayRollupAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" DROP COLUMN IF EXISTS "lastThirtyDayRollupAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" DROP COLUMN IF EXISTS "lastWeeklyRollupAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" ADD COLUMN IF NOT EXISTS "lastHourlyRollupAt" TIMESTAMP WITH TIME ZONE`,
    );
  }
}
