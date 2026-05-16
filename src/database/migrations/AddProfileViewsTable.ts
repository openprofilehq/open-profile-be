import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProfileViewsTable1710000000000 implements MigrationInterface {

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "profile_views" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "profile_id" uuid NOT NULL,
        "viewer_ip" varchar(45) NOT NULL,
        "user_agent" text NOT NULL DEFAULT 'unknown',
        "viewed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_profile_views_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_profile_views_profile"
          FOREIGN KEY ("profile_id")
          REFERENCES "profiles"("id")
          ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_profile_views_profile_viewed_at"
      ON "profile_views" ("profile_id", "viewed_at" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_profile_views_profile_ip"
      ON "profile_views" ("profile_id", "viewer_ip");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "profile_views";`);
  }
}