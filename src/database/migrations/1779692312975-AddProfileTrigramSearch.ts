import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileTrigramSearch1779692312975 implements MigrationInterface {
  name = 'AddProfileTrigramSearch1779692312975';
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_full_name_trgm_idx
      ON profiles USING GIN (full_name gin_trgm_ops);
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_username_trgm_idx
      ON profiles USING GIN (username gin_trgm_ops);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS profiles_username_trgm_idx;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS profiles_full_name_trgm_idx;
    `);

    // pg_trgm extension intentionally not dropped —
    // other parts of the schema may depend on it
  }
}
