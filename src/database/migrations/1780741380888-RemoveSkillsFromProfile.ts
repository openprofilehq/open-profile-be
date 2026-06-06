import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSkillsFromProfile1780741380888 implements MigrationInterface {
  name = 'RemoveSkillsFromProfile1780741380888';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "skills"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "profiles" ADD "skills" text array NOT NULL DEFAULT '{}'`,
    );
  }
}
