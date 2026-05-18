import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileViewsTable1778972184377 implements MigrationInterface {
  name = 'AddProfileViewsTable1778972184377';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "profile_views" ("id" uuid NOT NULL, "profile_id" uuid NOT NULL, "viewer_ip" character varying(45) NOT NULL, "user_agent" text, "viewed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d097089dc034d5c56a396ae2fd2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_profile_views_profile_ip" ON "profile_views" ("profile_id", "viewer_ip", "viewed_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_profile_views_profile_viewed_at" ON "profile_views" ("profile_id", "viewed_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_views" ADD CONSTRAINT "FK_d85d9173ce50a329dad9eb3e6a0" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profile_views" DROP CONSTRAINT "FK_d85d9173ce50a329dad9eb3e6a0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_profile_views_profile_viewed_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_profile_views_profile_ip"`,
    );
    await queryRunner.query(`DROP TABLE "profile_views"`);
  }
}
