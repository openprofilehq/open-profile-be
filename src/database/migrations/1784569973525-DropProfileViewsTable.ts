import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropProfileViewsTable1784569973525 implements MigrationInterface {
  name = 'DropProfileViewsTable1784569973525';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "profile_views" DROP CONSTRAINT IF EXISTS "FK_d85d9173ce50a329dad9eb3e6a0"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_profile_views_profile_viewed_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_profile_views_dedup"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "profile_views"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "profile_views" ("id" uuid NOT NULL, "profile_id" uuid NOT NULL, "viewer_ip" character varying(45) NOT NULL, "user_agent" text, "viewed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "dedup_key" character varying(128) NOT NULL, CONSTRAINT "PK_d097089dc034d5c56a396ae2fd2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_profile_views_dedup" ON "profile_views" ("dedup_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_profile_views_profile_viewed_at" ON "profile_views" ("profile_id", "viewed_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_views" ADD CONSTRAINT "FK_d85d9173ce50a329dad9eb3e6a0" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
