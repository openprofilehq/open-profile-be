import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillsToProfile1779692312975 implements MigrationInterface {
  name = 'AddSkillsToProfile1779692312975';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS profiles_skills_search_idx
      ON profiles USING GIN (skills);
    `);
    // ✅ GIN index on text[] — enables efficient per-element matching
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS profiles_skills_search_idx;
    `);

    await queryRunner.query(`
      ALTER TABLE profiles
      DROP COLUMN IF EXISTS skills;
    `);
  }
}
