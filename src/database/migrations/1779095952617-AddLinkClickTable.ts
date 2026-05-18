import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLinkClickTable1779095952617 implements MigrationInterface {
    name = 'AddLinkClickTable1779095952617'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "link_clicks" ("id" uuid NOT NULL, "profile_id" uuid NOT NULL, "link_type" character varying(32) NOT NULL, "target_id" uuid NOT NULL, "visitor_fp" character varying(64) NOT NULL, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_19d536461401f505e14ddf46ae6" PRIMARY KEY ("id"), CONSTRAINT "CK_link_clicks_link_type" CHECK ("link_type" IN ('social', 'website', 'custom')))`);
        await queryRunner.query(`CREATE INDEX "idx_lc_profile_occurred" ON "link_clicks" ("profile_id", "occurred_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "link_clicks" DROP CONSTRAINT "CK_link_clicks_link_type"`);
        await queryRunner.query(`DROP INDEX "public"."idx_lc_profile_occurred"`);
        await queryRunner.query(`DROP TABLE "link_clicks"`);
    }

}
