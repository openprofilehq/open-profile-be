import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventsCompositeIndex1784674199698 implements MigrationInterface {
  name = 'AddEventsCompositeIndex1784674199698';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_events_profileId_eventType_occurredAt" ON "events" ("profileId", "eventType", "occurredAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_events_profileId_eventType_occurredAt"`,
    );
  }
}
