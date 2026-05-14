import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropRefreshTokenHashFromUsers1778754115312 implements MigrationInterface {
  name = 'DropRefreshTokenHashFromUsers1778754115312';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "refresh_token_hash"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'users'
            AND column_name = 'refresh_token_hash'
        ) THEN
          ALTER TABLE "users"
          ADD "refresh_token_hash" character varying(500);
        END IF;
      END $$;
    `);
  }
}
