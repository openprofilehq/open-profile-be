import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDraftCtaFields1780742736400 implements MigrationInterface {
  name = 'AddDraftCtaFields1780742736400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profile_drafts" ADD "template_type" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_drafts" ADD "cta_label" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_drafts" ADD "cta_url" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profile_drafts" DROP COLUMN "cta_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_drafts" DROP COLUMN "cta_label"`,
    );
    await queryRunner.query(
      `ALTER TABLE "profile_drafts" DROP COLUMN "template_type"`,
    );
  }
}
