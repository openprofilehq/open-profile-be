import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateUserTable1778655152868 implements MigrationInterface {
    name = 'UpdateUserTable1778655152868'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_users_email"`);

        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_provider" character varying(50) NOT NULL DEFAULT 'email'`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_verified" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_complete" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "otp_hash" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "otp_expires_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_ip" character varying(45)`);

        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);

        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "created_at"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "created_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "updated_at"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "updated_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" TIMESTAMP`);

        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_97672ac88f789774dd47f7c8be"`);

        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "updated_at"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "created_at"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);

        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL`);

        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "last_login_ip"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "otp_expires_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "otp_hash"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "onboarding_complete"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "is_verified"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "auth_provider"`);

        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email")`);
    }
}