import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublishedAtToProfiles1787167016153 implements MigrationInterface {
  name = 'AddPublishedAtToProfiles1787167016153';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP COLUMN IF EXISTS "published_at"`,
    );
  }
}
