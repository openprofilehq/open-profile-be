import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDeviceIdFromRefreshTokens1778940374306 implements MigrationInterface {
  name = 'RemoveDeviceIdFromRefreshTokens1778940374306';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      DROP COLUMN IF EXISTS "device_id";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "device_id" VARCHAR;
    `);
  }
}
