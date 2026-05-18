import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMetricSnapshotTable1779096396824 implements MigrationInterface {
    name = 'AddMetricSnapshotTable1779096396824'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "metric_snapshots" ("id" uuid NOT NULL, "profile_id" uuid NOT NULL, "bucket" character varying(16) NOT NULL, "period_start" TIMESTAMP WITH TIME ZONE NOT NULL, "views" integer NOT NULL DEFAULT '0', "unique_reach" integer NOT NULL DEFAULT '0', "link_clicks" integer NOT NULL DEFAULT '0', "search_imps" integer NOT NULL DEFAULT '0', "computed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e7df991ed7476a98b561fc45083" PRIMARY KEY ("id"), CONSTRAINT "CHK_metric_snapshots_views_nonnegative" CHECK ("views" >= 0), CONSTRAINT "CHK_metric_snapshots_unique_reach_nonnegative" CHECK ("unique_reach" >= 0), CONSTRAINT "CHK_metric_snapshots_link_clicks_nonnegative" CHECK ("link_clicks" >= 0), CONSTRAINT "CHK_metric_snapshots_search_imps_nonnegative" CHECK ("search_imps" >= 0))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_ms_profile_bucket_period" ON "metric_snapshots" ("profile_id", "bucket", "period_start") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "metric_snapshots" DROP CONSTRAINT "CHK_metric_snapshots_views_nonnegative"`);
        await queryRunner.query(`ALTER TABLE "metric_snapshots" DROP CONSTRAINT "CHK_metric_snapshots_unique_reach_nonnegative"`);
        await queryRunner.query(`ALTER TABLE "metric_snapshots" DROP CONSTRAINT "CHK_metric_snapshots_link_clicks_nonnegative"`);
        await queryRunner.query(`ALTER TABLE "metric_snapshots" DROP CONSTRAINT "CHK_metric_snapshots_search_imps_nonnegative"`);
        await queryRunner.query(`DROP INDEX "public"."idx_ms_profile_bucket_period"`);
        await queryRunner.query(`DROP TABLE "metric_snapshots"`);
    }

}
