import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateProfileViewTable1779093861385 implements MigrationInterface {
    name = 'UpdateProfileViewTable1779093861385'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profile_views" ADD "viewer_id" uuid`);
        await queryRunner.query(`ALTER TABLE "profile_views" ADD "is_unique" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profile_views" DROP COLUMN "is_unique"`);
        await queryRunner.query(`ALTER TABLE "profile_views" DROP COLUMN "viewer_id"`);
    }

}
