import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingProfileColumns1779134183316 implements MigrationInterface {
  name = 'AddMissingProfileColumns1779134183316';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    `);

    await queryRunner.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS is_searchable BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles
      DROP COLUMN IF EXISTS is_searchable,
      DROP COLUMN IF EXISTS is_verified,
      DROP COLUMN IF EXISTS is_published,
      DROP COLUMN IF EXISTS deleted_at;
    `);
  }
}
