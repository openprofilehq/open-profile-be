import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDeviceIdFromRefreshTokensTable1778939927791 implements MigrationInterface {
  name = 'RemoveDeviceIdFromRefreshTokensTable1778939927791';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN "device_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD "device_id" character varying(36) NOT NULL`,
    );
  }
}
