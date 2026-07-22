import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFailedEventsResolvedIndex1783202164167 implements MigrationInterface {
  name = 'AddFailedEventsResolvedIndex1783202164167';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_failed_events_resolved" ON "failed_events" ("resolved")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_failed_events_resolved"`);
  }
}
