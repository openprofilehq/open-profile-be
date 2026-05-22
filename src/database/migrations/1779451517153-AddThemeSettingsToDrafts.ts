import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddThemeSettingsToDrafts1779451517153 implements MigrationInterface {
  name = 'AddThemeSettingsToDrafts1779451517153';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profile_drafts"
      ADD COLUMN IF NOT EXISTS "theme_settings" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "profile_drafts"
      DROP COLUMN IF EXISTS "theme_settings"
    `);
  }
}
