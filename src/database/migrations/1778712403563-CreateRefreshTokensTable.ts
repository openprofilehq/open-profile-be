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

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "components" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "profile_id" uuid NOT NULL,
        "section_type" character varying(50) NOT NULL,
        "title" character varying(255),
        "content" text,
        "metadata" jsonb,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "display_order" integer NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_components_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_components_profile_section"
      ON "components" ("profile_id", "section_type")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "username" character varying NOT NULL,
        "full_name" character varying NOT NULL,
        "bio" text,
        "photo_url" character varying,
        "template_type" character varying,
        "theme_settings" jsonb,
        "is_searchable" boolean NOT NULL DEFAULT true,
        "is_verified" boolean NOT NULL DEFAULT false,
        "is_published" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "UQ_profiles_username" UNIQUE ("username"),
        CONSTRAINT "UQ_profiles_user_id" UNIQUE ("user_id"),
        CONSTRAINT "PK_profiles_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_profiles_username"
      ON "profiles" ("username")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "device_id" character varying(36) NOT NULL,
        "token_hash" character varying(500) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_user_id"
      ON "refresh_tokens" ("user_id")
    `);

    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "provider"`,
    );

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "username" character varying(30)
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'UQ_users_username'
        ) THEN
          ALTER TABLE "users"
          ADD CONSTRAINT "UQ_users_username" UNIQUE ("username");
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "is_published" SET DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "reset_password"
      ALTER COLUMN "tokenSelector" DROP DEFAULT
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_username"
      ON "users" ("username")
    `);

    await queryRunner.query(`
      ALTER TABLE "components"
      ADD CONSTRAINT "FK_components_profile"
      FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "profiles"
      ADD CONSTRAINT "FK_profiles_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD CONSTRAINT "FK_refresh_tokens_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "FK_refresh_tokens_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "FK_profiles_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "components" DROP CONSTRAINT IF EXISTS "FK_components_profile"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_username"`);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "UQ_users_username"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "username"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "provider"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_refresh_tokens_user_id"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_profiles_username"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "profiles"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_components_profile_section"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "components"`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_reset_password_tokenSelector"
      ON "reset_password" ("tokenSelector")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "users_fullname_trgm_idx"
      ON "users" ("full_name")
    `);
  }
}
