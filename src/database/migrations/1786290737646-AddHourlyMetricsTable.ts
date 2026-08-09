import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHourlyMetricsTable1786290737646 implements MigrationInterface {
  name = 'AddHourlyMetricsTable1786290737646';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hourly_metrics_metrictype_enum') THEN CREATE TYPE "public"."hourly_metrics_metrictype_enum" AS ENUM('profile-views', 'link-clicks', 'search-events', 'invites'); END IF; END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "hourly_metrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "metricType" "public"."hourly_metrics_metrictype_enum" NOT NULL, "periodStart" TIMESTAMP WITH TIME ZONE NOT NULL, "count" bigint NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_hourly_metrics" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_hourly_metrics_metricType_periodStart" ON "hourly_metrics" ("metricType", "periodStart")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_hourly_metrics_metricType_periodStart"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "hourly_metrics"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."hourly_metrics_metrictype_enum"`,
    );
  }
}
