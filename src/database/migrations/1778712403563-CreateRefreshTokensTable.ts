import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokensTable1778712403563 implements MigrationInterface {
  name = 'CreateRefreshTokensTable1778712403563';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create refresh_tokens table for per-device session persistence
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "device_id" character varying(36) NOT NULL, "token_hash" character varying(500) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_3ddc983c5f7bcf132fd8732c3f" ON "refresh_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "FK_3ddc983c5f7bcf132fd8732c3f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Drop legacy refresh_token_hash from users
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "refresh_token_hash"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore refresh_token_hash column
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'users'
            AND column_name = 'refresh_token_hash'
        ) THEN
          ALTER TABLE "users"
          ADD "refresh_token_hash" character varying(500);
        END IF;
      END $$;
    `);

    // Drop refresh_tokens table
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT IF EXISTS "FK_3ddc983c5f7bcf132fd8732c3f4"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_3ddc983c5f7bcf132fd8732c3f"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}
