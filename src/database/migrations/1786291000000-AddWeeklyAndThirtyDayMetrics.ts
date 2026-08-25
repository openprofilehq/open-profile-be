import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWeeklyAndThirtyDayMetrics1786291000000 implements MigrationInterface {
  name = 'AddWeeklyAndThirtyDayMetrics1786291000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'weekly_metrics_metrictype_enum') THEN CREATE TYPE "public"."weekly_metrics_metrictype_enum" AS ENUM('profile-views', 'link-clicks', 'search-events', 'invites'); END IF; END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "weekly_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "metricType" "public"."weekly_metrics_metrictype_enum" NOT NULL, "periodStart" date NOT NULL, "count" bigint NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_weekly_metrics" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_weekly_metrics_metricType_periodStart" ON "weekly_metrics" ("metricType", "periodStart")`,
    );

    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'thirty_day_metrics_metrictype_enum') THEN CREATE TYPE "public"."thirty_day_metrics_metrictype_enum" AS ENUM('profile-views', 'link-clicks', 'search-events', 'invites'); END IF; END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "thirty_day_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "metricType" "public"."thirty_day_metrics_metrictype_enum" NOT NULL, "periodEnd" date NOT NULL, "count" bigint NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_thirty_day_metrics" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_thirty_day_metrics_metricType_periodEnd" ON "thirty_day_metrics" ("metricType", "periodEnd")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_thirty_day_metrics_metricType_periodEnd"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "thirty_day_metrics"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."thirty_day_metrics_metrictype_enum"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_weekly_metrics_metricType_periodStart"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "weekly_metrics"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."weekly_metrics_metrictype_enum"`,
    );
  }
}
