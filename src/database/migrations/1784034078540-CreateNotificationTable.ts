import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationTable1784034078540 implements MigrationInterface {
  name = 'CreateNotificationTable1784034078540';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type_enum" AS ENUM('INVITE_CLAIMED', 'PROFILE_VIEW_MILESTONE', 'SYSTEM_ANNOUNCEMENT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "type" "public"."notification_type_enum" NOT NULL, "title" character varying NOT NULL, "body" text NOT NULL, "metadata" jsonb, "isRead" boolean NOT NULL DEFAULT false, "readAt" TIMESTAMP WITH TIME ZONE, "dedupeKey" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "uq_notification_user_dedupe" UNIQUE ("userId", "dedupeKey"), CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ea34abc69625e58f67007481e1" ON "notification" ("userId", "isRead") `,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" ADD CONSTRAINT "FK_1ced25315eb974b73391fb1c81b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification" DROP CONSTRAINT "FK_1ced25315eb974b73391fb1c81b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ea34abc69625e58f67007481e1"`,
    );
    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(`DROP TYPE "public"."notification_type_enum"`);
  }
}
