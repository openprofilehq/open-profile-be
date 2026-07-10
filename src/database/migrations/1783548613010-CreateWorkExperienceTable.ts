import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkExperienceTable1783548613010 implements MigrationInterface {
  name = 'CreateWorkExperienceTable1783548613010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "work_experience" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "profile_id" uuid NOT NULL, "company_name" character varying(150) NOT NULL, "job_title" character varying(150) NOT NULL, "location" character varying(150), "description" text, "start_month" integer NOT NULL, "start_year" integer NOT NULL, "end_month" integer, "end_year" integer, "is_current" boolean NOT NULL DEFAULT false, "display_order" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d4bef63ad6da7ec327515c121bd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b0131f90b03322d19503c04de2" ON "work_experience" ("profile_id", "display_order") `,
    );
    await queryRunner.query(
      `ALTER TABLE "work_experience" ADD CONSTRAINT "FK_ea5182dc902fd3327674007822a" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_experience" DROP CONSTRAINT "FK_ea5182dc902fd3327674007822a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b0131f90b03322d19503c04de2"`,
    );
    await queryRunner.query(`DROP TABLE "work_experience"`);
  }
}
