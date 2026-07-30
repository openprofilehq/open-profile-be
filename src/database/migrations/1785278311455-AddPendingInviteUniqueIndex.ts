import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingInviteUniqueIndex1785278311455 implements MigrationInterface {
  name = 'AddPendingInviteUniqueIndex1785278311455';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invites_pending_inviter_recipient" ON "invites" ("inviterUserId", "recipientEmail") WHERE "claimedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_invites_pending_inviter_recipient"`,
    );
  }
}
