import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillDefaultProfileComponents1783600000000 implements MigrationInterface {
  name = 'BackfillDefaultProfileComponents1783600000000';

  private readonly sectionTypes = [
    'bio',
    'links',
    'projects',
    'cta',
    'work_experience',
    'education',
    'skills',
    'awards',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const profiles = (await queryRunner.query(
      `SELECT id FROM "profiles" WHERE "deleted_at" IS NULL`,
    )) as { id: string }[];

    for (const profile of profiles) {
      const existing = (await queryRunner.query(
        `SELECT section_type FROM "components" WHERE "profile_id" = $1`,
        [profile.id],
      )) as { section_type: string }[];
      const existingTypes = new Set(existing.map((r) => r.section_type));

      let displayOrder = existingTypes.size;
      for (const sectionType of this.sectionTypes) {
        if (existingTypes.has(sectionType)) continue;
        await queryRunner.query(
          `INSERT INTO "components" ("id", "profile_id", "section_type", "is_enabled", "display_order", "created_at", "updated_at")
           VALUES (uuid_generate_v4(), $1, $2, true, $3, NOW(), NOW())`,
          [profile.id, sectionType, displayOrder],
        );
        displayOrder++;
      }
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible by design — i don't know which rows were backfilled
    // vs. pre-existing. Down migration intentionally left as a no-op;
    // revert manually via DB backup if needed.
  }
}
