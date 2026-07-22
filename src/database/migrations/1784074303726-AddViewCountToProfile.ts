import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddViewCountToProfile1784074303726 implements MigrationInterface {
  name = 'AddViewCountToProfile1784074303726';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "view_count" integer NOT NULL DEFAULT '0'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "view_count"`);
  }
}
