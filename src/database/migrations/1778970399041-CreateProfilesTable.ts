import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProfilesTable1778970399041 implements MigrationInterface {
    name = 'CreateProfilesTable1778970399041'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profile_views" DROP CONSTRAINT "fk_profile_views_profile"`);
        await queryRunner.query(`ALTER TABLE "reset_password" ALTER COLUMN "userId" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "profile_views" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "profile_views" ADD CONSTRAINT "FK_d85d9173ce50a329dad9eb3e6a0" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profile_views" DROP CONSTRAINT "FK_d85d9173ce50a329dad9eb3e6a0"`);
        await queryRunner.query(`ALTER TABLE "profile_views" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "reset_password" ALTER COLUMN "userId" SET DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "profile_views" ADD CONSTRAINT "fk_profile_views_profile" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
