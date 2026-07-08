import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnonymousIdToEvents1783413945966 implements MigrationInterface {
  name = 'AddAnonymousIdToEvents1783413945966';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" ADD "anonymousId" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_events_anonymousId" ON "events" ("anonymousId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_events_anonymousId"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "anonymousId"`);
  }
}
