import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropIsReadFromNotification1784277476637 implements MigrationInterface {
  name = 'DropIsReadFromNotification1784277476637';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ea34abc69625e58f67007481e1"`,
    );
    await queryRunner.query(`ALTER TABLE "notification" DROP COLUMN "isRead"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_unread" ON "notification" ("userId") WHERE "readAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_notification_unread"`);
    await queryRunner.query(
      `ALTER TABLE "notification" ADD "isRead" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ea34abc69625e58f67007481e1" ON "notification" ("userId", "isRead")`,
    );
  }
}
