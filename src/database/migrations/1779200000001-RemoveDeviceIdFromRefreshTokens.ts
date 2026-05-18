import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDeviceIdFromRefreshTokens1779200000001 implements MigrationInterface {
  name = 'RemoveDeviceIdFromRefreshTokens1779200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      DROP COLUMN IF EXISTS "device_id";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "device_id" character varying(36) NOT NULL DEFAULT '';
    `);
  }
}
