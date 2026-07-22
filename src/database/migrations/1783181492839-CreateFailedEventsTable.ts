import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFailedEventsTable1783181492839 implements MigrationInterface {
  name = 'CreateFailedEventsTable1783181492839';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "failed_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "payload" jsonb NOT NULL, "errorMessage" character varying NOT NULL, "errorCode" character varying, "attemptCount" integer NOT NULL DEFAULT '0', "resolved" boolean NOT NULL DEFAULT false, "failedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ee75f8d29b0adf456ded4e8c8e7" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "failed_events"`);
  }
}
