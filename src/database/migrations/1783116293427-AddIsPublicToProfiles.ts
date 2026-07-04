import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsPublicToProfiles1783116293427 implements MigrationInterface {
  name = 'AddIsPublicToProfiles1783116293427';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles
      DROP COLUMN IF EXISTS is_public;
    `);
  }
}
