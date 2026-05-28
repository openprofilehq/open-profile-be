import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUserFullNameNullable1779990354068 implements MigrationInterface {
  name = 'MakeUserFullNameNullable1779990354068';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "full_name" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "full_name" SET NOT NULL`,
    );
  }
}
