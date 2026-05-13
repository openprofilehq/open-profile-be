import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePortfolioItems1778684776215 implements MigrationInterface {
  name = 'CreatePortfolioItems1778684776215';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."users_username_unique_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."users_full_name_trgm_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."users_username_trgm_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_portfolio_items_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD IF NOT EXISTS "created_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD IF NOT EXISTS "deleted_at" TIMESTAMP`,
    );

    // Only create the index if the portfolio_items table exists
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'portfolio_items'
        ) THEN
          CREATE INDEX IF NOT EXISTS "IDX_8419821c2b923a4c66bf4b81c2" ON "portfolio_items" ("user_id");
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_8419821c2b923a4c66bf4b81c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD IF NOT EXISTS "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD IF NOT EXISTS "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'portfolio_items'
        ) THEN
          CREATE INDEX IF NOT EXISTS "IDX_portfolio_items_user_id" ON "portfolio_items" ("user_id");
        END IF;
      END $$
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "users_username_trgm_idx" ON "users" ("username")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "users_full_name_trgm_idx" ON "users" ("full_name")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique_idx" ON "users" ("username") WHERE (username IS NOT NULL)`,
    );
  }
}