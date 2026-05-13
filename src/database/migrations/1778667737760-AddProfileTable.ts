import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileTable1778667737760 implements MigrationInterface {
  name = 'AddProfileTable1778667737760';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reset_password" DROP CONSTRAINT "FK_reset_password_user"`,
    );
    await queryRunner.query(
      `CREATE TABLE "waitList" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "emailSent" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c964d1d61359c1a9f8aa31eb0c2" UNIQUE ("email"), CONSTRAINT "PK_f96a6aa67f33d3613d1a7f904ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "components" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "section_type" character varying(50) NOT NULL, "title" character varying(255), "content" text, "metadata" jsonb, "is_enabled" boolean NOT NULL DEFAULT true, "display_order" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0d742661c63926321b5f5eac1ad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0227b7215b6c00993dae7fe5fa" ON "components" ("profile_id", "section_type") `,
    );
    await queryRunner.query(
      `CREATE TABLE "profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "username" character varying NOT NULL, "full_name" character varying NOT NULL, "bio" text, "photo_url" character varying, "template_type" character varying, "theme_settings" jsonb, "is_searchable" boolean NOT NULL DEFAULT true, "is_verified" boolean NOT NULL DEFAULT false, "is_published" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_d1ea35db5be7c08520d70dc03f8" UNIQUE ("username"), CONSTRAINT "REL_9e432b7df0d182f8d292902d1a" UNIQUE ("user_id"), CONSTRAINT "PK_8e520eb4da7dc01d0e190447c8e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d1ea35db5be7c08520d70dc03f" ON "profiles" ("username") `,
    );
    await queryRunner.query(
      `ALTER TABLE "reset_password" ALTER COLUMN "id" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "reset_password" DROP COLUMN "userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reset_password" ADD "userId" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "components" ADD CONSTRAINT "FK_0d0d64b9f9f3c84a460d7a2614a" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP CONSTRAINT "FK_9e432b7df0d182f8d292902d1a2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "components" DROP CONSTRAINT "FK_0d0d64b9f9f3c84a460d7a2614a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reset_password" DROP COLUMN "userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reset_password" ADD "userId" uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "reset_password" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d1ea35db5be7c08520d70dc03f"`,
    );
    await queryRunner.query(`DROP TABLE "profiles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0227b7215b6c00993dae7fe5fa"`,
    );
    await queryRunner.query(`DROP TABLE "components"`);
    await queryRunner.query(`DROP TABLE "waitList"`);
    await queryRunner.query(
      `ALTER TABLE "reset_password" ADD CONSTRAINT "FK_reset_password_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
