import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatusToUsers1786656333775 implements MigrationInterface {
  name = 'AddStatusToUsers1786656333775';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'users_status_enum') THEN CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'blocked', 'suspended', 'deactivated', 'flagged_for_review'); END IF; END $$`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" "public"."users_status_enum" NOT NULL DEFAULT 'active'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "status"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_status_enum"`);
  }
}
