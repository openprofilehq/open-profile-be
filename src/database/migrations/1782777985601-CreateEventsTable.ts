import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEventsTable1782777985601 implements MigrationInterface {
  name = 'CreateEventsTable1782777985601';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."events_eventtype_enum" AS ENUM('PROFILE_VIEWED', 'LINK_CLICKED', 'SEARCH_PERFORMED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "eventType" "public"."events_eventtype_enum" NOT NULL, "actorId" uuid, "profileId" uuid, "metadata" jsonb, "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4ec7713fb43c8debfa44d763e1" ON "events" ("eventType", "occurredAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3dabdcc7db366f6b4f51d3841f" ON "events" ("profileId", "occurredAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3dabdcc7db366f6b4f51d3841f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4ec7713fb43c8debfa44d763e1"`,
    );
    await queryRunner.query(`DROP TABLE "events"`);
    await queryRunner.query(`DROP TYPE "public"."events_eventtype_enum"`);
  }
}
