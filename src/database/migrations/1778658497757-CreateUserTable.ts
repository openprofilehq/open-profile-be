import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserTable1778658497757 implements MigrationInterface {
  name = 'CreateUserTable1778658497757';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'user')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "password" character varying(255) NOT NULL, "full_name" character varying(255) NOT NULL, "username" character varying(30), "bio" text, "photo_url" character varying(500), "is_published" boolean NOT NULL DEFAULT false, "role" "public"."users_role_enum", "auth_provider" character varying(50) NOT NULL DEFAULT 'email', "is_verified" boolean NOT NULL DEFAULT false, "onboarding_complete" boolean NOT NULL DEFAULT false, "otp_hash" character varying(255), "otp_expires_at" TIMESTAMP WITH TIME ZONE, "last_login_ip" character varying(45), "refresh_token_hash" character varying(500), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON "users" ("username") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fe0bb3f6520ee0469504521e71"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
