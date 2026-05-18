import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContentToProfile1779100000000 implements MigrationInterface {
  name = 'AddContentToProfile1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "content" jsonb DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" DROP COLUMN IF EXISTS "content"`,
    );
  }
}
