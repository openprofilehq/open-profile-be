import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEducationTable1783526043157 implements MigrationInterface {
  name = 'CreateEducationTable1783526043157';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "education" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "school" character varying(150) NOT NULL, "degree" character varying(150) NOT NULL, "field_of_study" character varying(150) NOT NULL, "location" character varying(150), "activities_honors" text, "start_year" integer NOT NULL, "end_year" integer NOT NULL, "display_order" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bf3d38701b3030a8ad634d43bd6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2475452b807f15f0ee0d579b09" ON "education" ("profile_id", "display_order") `,
    );
    await queryRunner.query(
      `ALTER TABLE "education" ADD CONSTRAINT "FK_79077876915d6aa872cda4e38fd" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "education" DROP CONSTRAINT "FK_79077876915d6aa872cda4e38fd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2475452b807f15f0ee0d579b09"`,
    );
    await queryRunner.query(`DROP TABLE "education"`);
  }
}
