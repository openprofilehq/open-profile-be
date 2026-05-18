import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProfileEventTable1779094888119 implements MigrationInterface {
    name = 'AddProfileEventTable1779094888119'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "profile_events" ("id" uuid NOT NULL, "profile_id" uuid NOT NULL, "eventType" character varying(32) NOT NULL, "visitor_fp" character varying(64) NOT NULL, "viewer_id" uuid, "metadata" jsonb DEFAULT '{}', "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ca82692dc95b4cbd417a99e7cda" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_pe_visitor_fp" ON "profile_events" ("visitor_fp") `);
        await queryRunner.query(`CREATE INDEX "idx_pe_profile_occurred" ON "profile_events" ("profile_id", "occurred_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_pe_profile_occurred"`);
        await queryRunner.query(`DROP INDEX "public"."idx_pe_visitor_fp"`);
        await queryRunner.query(`DROP TABLE "profile_events"`);
    }

}
