import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSearchImpressionTable1779096147863 implements MigrationInterface {
    name = 'AddSearchImpressionTable1779096147863'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "search_impressions" ("id" uuid NOT NULL, "profile_id" uuid NOT NULL, "keyword" character varying(255) NOT NULL, "position" integer, "visitor_fp" character varying(64) NOT NULL, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4060c586d5353253d2f8bc8dfc9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_si_profile_occurred" ON "search_impressions" ("profile_id", "occurred_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_si_profile_occurred"`);
        await queryRunner.query(`DROP TABLE "search_impressions"`);
    }

}
