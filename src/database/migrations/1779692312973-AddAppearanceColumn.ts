import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppearanceColumn1779692312973 implements MigrationInterface {
  name = 'AddAppearanceColumn1779692312973';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          ALTER TABLE "profiles"
          ADD COLUMN IF NOT EXISTS "appearance" jsonb
        `);
    await queryRunner.query(`
          ALTER TABLE "profile_drafts"
          ADD COLUMN IF NOT EXISTS "appearance" jsonb
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          ALTER TABLE "profiles" DROP COLUMN IF EXISTS "appearance"
        `);
    await queryRunner.query(`
          ALTER TABLE "profile_drafts" DROP COLUMN IF EXISTS "appearance"
        `);
  }
}
