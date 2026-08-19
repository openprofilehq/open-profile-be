import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserStatusHistoryTable1786656333775 implements MigrationInterface {
  name = 'CreateUserStatusHistoryTable1786656333775';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "user_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "from_status" "public"."users_status_enum" NOT NULL, "to_status" "public"."users_status_enum" NOT NULL, "changed_by" uuid, "changed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_user_status_history" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_status_history_user_id" ON "user_status_history" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_status_history" ADD CONSTRAINT "FK_user_status_history_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_status_history" ADD CONSTRAINT "FK_user_status_history_changed_by" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_status_history" DROP CONSTRAINT IF EXISTS "FK_user_status_history_changed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_status_history" DROP CONSTRAINT IF EXISTS "FK_user_status_history_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_user_status_history_user_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_status_history"`);
  }
}
