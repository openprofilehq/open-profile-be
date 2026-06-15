import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClearProfileComponentAppearance1781449614000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE profiles
      SET appearance = appearance - 'components'
      WHERE appearance -> 'components' IS NOT NULL
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible — component-level appearance data is not backed up
  }
}
