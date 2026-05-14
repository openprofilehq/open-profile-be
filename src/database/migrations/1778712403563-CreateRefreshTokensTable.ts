import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokensTable1778712403563 implements MigrationInterface {
  name = 'CreateRefreshTokensTable1778712403563';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."users_fullname_trgm_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_reset_password_tokenSelector"`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "components" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "section_type" character varying(50) NOT NULL, "title" character varying(255), "content" text, "metadata" jsonb, "is_enabled" boolean NOT NULL DEFAULT true, "display_order" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0d742661c63926321b5f5eac1ad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_0227b7215b6c00993dae7fe5fa" ON "components" ("profile_id", "section_type")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "username" character varying NOT NULL, "full_name" character varying NOT NULL, "bio" text, "photo_url" character varying, "template_type" character varying, "theme_settings" jsonb, "is_searchable" boolean NOT NULL DEFAULT true, "is_verified" boolean NOT NULL DEFAULT false, "is_published" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_d1ea35db5be7c08520d70dc03f8" UNIQUE ("username"), CONSTRAINT "REL_9e432b7df0d182f8d292902d1a" UNIQUE ("user_id"), CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_d1ea35db5be7c08520d70dc03f" ON "profiles" ("username")`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "device_id" character varying(36) NOT NULL, "token_hash" character varying(500) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_3ddc983c5f7bcf132fd8732c3f" ON "refresh_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "provider"`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitList" ADD CONSTRAINT IF NOT EXISTS "UQ_c964d1d61359c1a9f8aa31eb0c2" UNIQUE ("email")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "username"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD IF NOT EXISTS "username" character varying(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_fe0bb3f6520ee0469504521e710"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "is_published" SET DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "reset_password" ALTER COLUMN "tokenSelector" DROP DEFAULT`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fe0bb3f6520ee0469504521e71" ON "users" ("username")`,
    );
    await queryRunner.query(
      `ALTER TABLE "components" DROP CONSTRAINT IF EXISTS "FK_0d0d64b9f9f3c84a460d7a2614a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "components" ADD CONSTRAINT "FK_0d0d64b9f9f3c84a460d7a2614a" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "FK_9e432b7df0d182f8d292902d1a2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "FK_3ddc983c5f7bcf132fd8732c3f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "FK_3ddc983c5f7bcf132fd8732c3f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "FK_9e432b7df0d182f8d292902d1a2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "components" DROP CONSTRAINT IF EXISTS "FK_0d0d64b9f9f3c84a460d7a2614a"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_fe0bb3f6520ee0469504521e71"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reset_password" ALTER COLUMN "tokenSelector" SET DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "is_published" SET DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_fe0bb3f6520ee0469504521e710"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "username"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD IF NOT EXISTS "username" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitList" DROP CONSTRAINT IF EXISTS "UQ_c964d1d61359c1a9f8aa31eb0c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "provider"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_3ddc983c5f7bcf132fd8732c3f"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_d1ea35db5be7c08520d70dc03f"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "profiles"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_0227b7215b6c00993dae7fe5fa"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "components"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_reset_password_tokenSelector" ON "reset_password" ("tokenSelector")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "users_fullname_trgm_idx" ON "users" ("full_name")`,
    );
  }
}
