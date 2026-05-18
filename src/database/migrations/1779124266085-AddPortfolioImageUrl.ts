import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPortfolioImageUrl1779124266085 implements MigrationInterface {
    name = 'AddPortfolioImageUrl1779124266085'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profile_views" DROP COLUMN "viewer_id"`);
        await queryRunner.query(`ALTER TABLE "profile_views" DROP COLUMN "is_unique"`);
        await queryRunner.query(`ALTER TABLE "portfolio_items" ADD "image_url" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "portfolio_items" DROP COLUMN "image_url"`);
        await queryRunner.query(`ALTER TABLE "profile_views" ADD "is_unique" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "profile_views" ADD "viewer_id" uuid`);
    }

}
