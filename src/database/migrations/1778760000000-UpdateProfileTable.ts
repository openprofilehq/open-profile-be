import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateProfileTable1778760000000 implements MigrationInterface {
  name = 'UpdateProfileTable1778760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "has_unpublished_changes" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP COLUMN IF EXISTS "has_unpublished_changes"`,
    );
  }
}
