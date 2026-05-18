import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingProfileColumns1779134183316 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE EXTENSION IF NOT EXISTS pg_trgm;
        `);

    await queryRunner.query(`
            ALTER TABLE profiles
            ADD COLUMN IF NOT EXISTS username VARCHAR(255),
            ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS bio TEXT,
            ADD COLUMN IF NOT EXISTS photo_url TEXT,
            ADD COLUMN IF NOT EXISTS template_type VARCHAR(100),
            ADD COLUMN IF NOT EXISTS theme_settings JSONB,
            ADD COLUMN IF NOT EXISTS has_unpublished_changes BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS cta_label VARCHAR(255),
            ADD COLUMN IF NOT EXISTS cta_url TEXT;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE profiles
            DROP COLUMN IF EXISTS username,
            DROP COLUMN IF EXISTS full_name,
            DROP COLUMN IF EXISTS bio,
            DROP COLUMN IF EXISTS photo_url,
            DROP COLUMN IF EXISTS template_type,
            DROP COLUMN IF EXISTS theme_settings,
            DROP COLUMN IF EXISTS has_unpublished_changes,
            DROP COLUMN IF EXISTS cta_label,
            DROP COLUMN IF EXISTS cta_url;
        `);
  }
}
