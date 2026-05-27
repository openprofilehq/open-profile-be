import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileSearchIndex1779134183317 implements MigrationInterface {
  name = 'AddProfileSearchIndex1779134183317';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS profiles_search_idx
      ON profiles USING GIN (
        to_tsvector('english', full_name || ' ' || username)
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS profiles_search_idx;
    `);
  }
}
