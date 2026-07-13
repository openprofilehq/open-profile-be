import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAwardsTable1783599865184 implements MigrationInterface {
  name = 'CreateAwardsTable1783599865184';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "awards" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "title" character varying(150) NOT NULL, "issuer" character varying(150) NOT NULL, "award_date" date NOT NULL, "description" text, "credential_url" character varying(500), "display_order" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bc3f6adc548ff46c76c03e06377" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9cf8e5b78c239126b522af2231" ON "awards" ("profile_id", "display_order") `,
    );
    await queryRunner.query(
      `ALTER TABLE "awards" ADD CONSTRAINT "FK_aa9706a652d4d37ea72256eb3e7" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "awards" DROP CONSTRAINT "FK_aa9706a652d4d37ea72256eb3e7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9cf8e5b78c239126b522af2231"`,
    );
    await queryRunner.query(`DROP TABLE "awards"`);
  }
}
