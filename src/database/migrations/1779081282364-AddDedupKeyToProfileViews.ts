import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDedupKeyToProfileViews1779081282364 implements MigrationInterface {
  name = 'AddDedupKeyToProfileViews1779081282364';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_profile_views_profile_ip"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_views" ADD "dedup_key" character varying(128)`,
    );
    await queryRunner.query(`
            UPDATE "profile_views"
            SET "dedup_key" = "profile_id"::text || ':' || "viewer_ip" || ':' || FLOOR(EXTRACT(EPOCH FROM "viewed_at") / 300)
        `);
    await queryRunner.query(`
            DELETE FROM "profile_views"
            WHERE ctid NOT IN (
                SELECT MIN(ctid) FROM "profile_views" GROUP BY dedup_key
            )
        `);
    await queryRunner.query(
      `ALTER TABLE "profile_views" ALTER COLUMN "dedup_key" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_profile_views_dedup" ON "profile_views" ("dedup_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_profile_views_dedup"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_views" DROP COLUMN "dedup_key"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_profile_views_profile_ip" ON "profile_views" ("profile_id", "viewed_at", "viewer_ip")`,
    );
  }
}
