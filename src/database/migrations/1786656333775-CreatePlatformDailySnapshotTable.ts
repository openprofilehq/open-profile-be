import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlatformDailySnapshotTable1786656333775 implements MigrationInterface {
  name = 'CreatePlatformDailySnapshotTable1786656333775';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "platform_daily_snapshot" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "period_date" date NOT NULL, "total_users" integer NOT NULL DEFAULT '0', "published_profiles" integer NOT NULL DEFAULT '0', "profile_completion_rate" numeric(5,2) NOT NULL DEFAULT '0', "weekly_active_profiles" integer NOT NULL DEFAULT '0', "new_users_today" integer NOT NULL DEFAULT '0', "profiles_published_today" integer NOT NULL DEFAULT '0', "flagged_for_review" integer NOT NULL DEFAULT '0', "active_suspensions" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_platform_daily_snapshot" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_platform_daily_snapshot_period_date" ON "platform_daily_snapshot" ("period_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_platform_daily_snapshot_period_date"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_daily_snapshot"`);
  }
}
