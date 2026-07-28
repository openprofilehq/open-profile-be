import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInviteSystem1784994046406 implements MigrationInterface {
  name = 'CreateInviteSystem1784994046406';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "invites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "inviterUserId" uuid NOT NULL, "recipientEmail" character varying NOT NULL, "token" character varying NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "clickedAt" TIMESTAMP WITH TIME ZONE, "claimedAt" TIMESTAMP WITH TIME ZONE, "claimedByUserId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_18a9a6c85f7cc6f42ebef3b3188" UNIQUE ("token"), CONSTRAINT "PK_aa52e96b44a714372f4dd31a0af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_18a9a6c85f7cc6f42ebef3b318" ON "invites" ("token")`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_events_profileId_eventType_occurredAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_4ec7713fb43c8debfa44d763e1"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."events_eventtype_enum" RENAME TO "events_eventtype_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."events_eventtype_enum" AS ENUM('PROFILE_VIEWED', 'LINK_CLICKED', 'SEARCH_PERFORMED', 'INVITE_SENT', 'INVITE_CLAIMED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ALTER COLUMN "eventType" TYPE "public"."events_eventtype_enum" USING "eventType"::"text"::"public"."events_eventtype_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."events_eventtype_enum_old"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_events_profileId_eventType_occurredAt" ON "events" ("profileId", "eventType", "occurredAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_4ec7713fb43c8debfa44d763e1" ON "events" ("eventType", "occurredAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "invites" ADD CONSTRAINT "FK_af03728911bd28935cbb2642280" FOREIGN KEY ("inviterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invites" DROP CONSTRAINT IF EXISTS "FK_af03728911bd28935cbb2642280"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_4ec7713fb43c8debfa44d763e1"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_events_profileId_eventType_occurredAt"`,
    );
    await queryRunner.query(
      `CREATE TYPE IF NOT EXISTS "public"."events_eventtype_enum_old" AS ENUM('PROFILE_VIEWED', 'LINK_CLICKED', 'SEARCH_PERFORMED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ALTER COLUMN "eventType" TYPE "public"."events_eventtype_enum_old" USING "eventType"::"text"::"public"."events_eventtype_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."events_eventtype_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."events_eventtype_enum_old" RENAME TO "events_eventtype_enum"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_4ec7713fb43c8debfa44d763e1" ON "events" ("eventType", "occurredAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_events_profileId_eventType_occurredAt" ON "events" ("profileId", "eventType", "occurredAt")`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_18a9a6c85f7cc6f42ebef3b318"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "invites"`);
  }
}
