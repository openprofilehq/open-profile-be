import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDeviceIdFromRefreshTokens1778940374306 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "refresh_tokens"
            DROP COLUMN IF EXISTS "device_id";
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "refresh_tokens"
            ADD COLUMN "device_id" VARCHAR;
        `);
  }
}
