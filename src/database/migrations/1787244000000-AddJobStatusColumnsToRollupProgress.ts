import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddJobStatusColumnsToRollupProgress1787244000000 implements MigrationInterface {
  name = 'AddJobStatusColumnsToRollupProgress1787244000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" ADD COLUMN IF NOT EXISTS "lastDailyRollupStatus" character varying(20) DEFAULT 'success'`,
    );
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" ADD COLUMN IF NOT EXISTS "lastSnapshotAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" ADD COLUMN IF NOT EXISTS "lastSnapshotStatus" character varying(20) DEFAULT 'success'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" DROP COLUMN IF EXISTS "lastSnapshotStatus"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" DROP COLUMN IF EXISTS "lastSnapshotAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rollup_progress" DROP COLUMN IF EXISTS "lastDailyRollupStatus"`,
    );
  }
}
