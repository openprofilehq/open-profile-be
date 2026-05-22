import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenIdToRefreshTokens1779472953248 implements MigrationInterface {
  name = 'AddTokenIdToRefreshTokens1779472953248';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // step 1 — add column as nullable
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "token_id" character varying(36)`,
    );

    // step 2 — backfill existing rows so the unique constraint doesn't fail on nulls
    await queryRunner.query(
      `UPDATE "refresh_tokens" SET "token_id" = id WHERE "token_id" IS NULL`,
    );

    // step 3 — enforce not null now that all rows have a value
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ALTER COLUMN "token_id" SET NOT NULL`,
    );

    // step 4 — unique constraint and index (unchanged from generated)
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "UQ_b4bffc4033b7bd52e241210710c" UNIQUE ("token_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b4bffc4033b7bd52e241210710" ON "refresh_tokens" ("token_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b4bffc4033b7bd52e241210710"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "UQ_b4bffc4033b7bd52e241210710c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "token_id"`,
    );
  }
}
