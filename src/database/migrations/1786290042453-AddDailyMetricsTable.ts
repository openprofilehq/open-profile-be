import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDailyMetricsTable1786290042453 implements MigrationInterface {
  name = 'AddDailyMetricsTable1786290042453';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'daily_metrics_metrictype_enum') THEN CREATE TYPE "public"."daily_metrics_metrictype_enum" AS ENUM('profile-views', 'link-clicks', 'search-events', 'invites'); END IF; END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "daily_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "metricType" "public"."daily_metrics_metrictype_enum" NOT NULL, "periodDate" date NOT NULL, "count" bigint NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_daily_metrics" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_daily_metrics_metricType_periodDate" ON "daily_metrics" ("metricType", "periodDate")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_daily_metrics_metricType_periodDate"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_metrics"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."daily_metrics_metrictype_enum"`,
    );
  }
}
