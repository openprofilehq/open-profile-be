import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropRefreshTokenHashFromUsers1778754115312 implements MigrationInterface {
  name = 'DropRefreshTokenHashFromUsers1778754115312';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "refresh_token_hash"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "refresh_token_hash" character varying(500)`,
    );
  }
}
