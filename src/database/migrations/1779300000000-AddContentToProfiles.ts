import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentToProfiles1779300000000 implements MigrationInterface {
  name = 'AddContentToProfiles1779300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE "profiles"
        ADD COLUMN IF NOT EXISTS "content" jsonb DEFAULT NULL;
      `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        ALTER TABLE "profiles"
        DROP COLUMN IF EXISTS "content";
      `);
  }
}
