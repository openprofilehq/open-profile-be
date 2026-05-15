import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCtaFieldsToProfile1778844521139 implements MigrationInterface {
  name = 'AddCtaFieldsToProfile1778844521139';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "cta_label" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "cta_url" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "cta_url"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "cta_label"`);
  }
}
