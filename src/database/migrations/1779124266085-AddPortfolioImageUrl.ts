import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPortfolioImageUrl1779124266085 implements MigrationInterface {
  name = 'AddPortfolioImageUrl1779124266085';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "portfolio_items" ADD "image_url" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "portfolio_items" DROP COLUMN "image_url"`,
    );
  }
}
