import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResetPassword1778661337910 implements MigrationInterface {
  name = 'AddResetPassword1778661337910';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reset_password" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "tokenSelector" character varying(64) NOT NULL,
        "tokenHash" text NOT NULL,
        "used" boolean NOT NULL DEFAULT false,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_82bffbeb85c5b426956d004a8f5"
        PRIMARY KEY ("id"),
        CONSTRAINT "FK_reset_password_user"
        FOREIGN KEY ("userId")
        REFERENCES "users"("id")
        ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reset_password"`);
  }
}
