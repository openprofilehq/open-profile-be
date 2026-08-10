import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRollUpProgressTable1786290927918 implements MigrationInterface {
  name = 'AddRollUpProgressTable1786290927918';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "rollup_progress" ("id" character varying NOT NULL, "lastHourlyRollupAt" TIMESTAMP WITH TIME ZONE, "lastDailyRollupAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_rollup_progress" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rollup_progress"`);
  }
}
