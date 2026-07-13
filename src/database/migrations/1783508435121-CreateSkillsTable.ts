import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSkillsTable1783508435121 implements MigrationInterface {
  name = 'CreateSkillsTable1783508435121';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "skills" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "level" character varying(20), "display_order" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0d3212120f4ecedf90864d7e298" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3262d8b601fdd014a98f0ff846" ON "skills" ("profile_id", "display_order") `,
    );
    await queryRunner.query(
      `ALTER TABLE "skills" ADD CONSTRAINT "FK_f5144e450e1e3d4cf9ccbf6cece" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skills" DROP CONSTRAINT "FK_f5144e450e1e3d4cf9ccbf6cece"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3262d8b601fdd014a98f0ff846"`,
    );
    await queryRunner.query(`DROP TABLE "skills"`);
  }
}
