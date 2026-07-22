import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPreferencesToUser1784308752747 implements MigrationInterface {
  name = 'AddPreferencesToUser1784308752747';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "preferences"`,
    );
  }
}
