import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileDraft1779266831890 implements MigrationInterface {
  name = 'AddProfileDraft1779266831890';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "profile_drafts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "username" text, "full_name" text, "bio" text, "photo_url" character varying, "content" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, CONSTRAINT "UQ_734f91b7d9308715e86f585c186" UNIQUE ("profile_id"), CONSTRAINT "PK_49f31a14c565fd2c9f378cb3585" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_drafts" ADD CONSTRAINT "FK_734f91b7d9308715e86f585c186" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profile_drafts" DROP CONSTRAINT "FK_734f91b7d9308715e86f585c186"`,
    );
    await queryRunner.query(`DROP TABLE "profile_drafts"`);
  }
}
