import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReconcileRefreshTokenRotation1778888995186 implements MigrationInterface {
  name = 'ReconcileRefreshTokenRotation1778888995186';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ALTER COLUMN "full_name" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ALTER COLUMN "full_name" DROP NOT NULL`,
    );
  }
}
