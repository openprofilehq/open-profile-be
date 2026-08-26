import 'reflect-metadata';
import dataSource from '../data-source';
import {
  buildMetricTypeCaseSql,
  TRACKED_EVENT_TYPES_SQL,
} from '../../modules/admin/constants/metrics-rollup';
import { eventSeeder } from './event.seeder';
import { usersSeeder } from './users.seeder';
import { profileSeeder } from './profile.seeder';

const TARGET_EVENTS = parseInt(process.env.SEED_EVENT_COUNT ?? '250000', 10);
const DAY_MS = 24 * 60 * 60 * 1000;

interface ChunkResult {
  day: string;
  rows: number;
  durationMs: number;
}

async function run() {
  await dataSource.initialize();
  console.log('Open Profile - Load Test\n');

  console.log('Phase 1: Ensuring baseline users and profiles...');
  await usersSeeder.run(dataSource);
  await profileSeeder.run(dataSource);

  console.log(`\nPhase 2: Seeding ${TARGET_EVENTS.toLocaleString()} events...`);
  await eventSeeder.run(dataSource, TARGET_EVENTS);

  const countResult = await dataSource.query<{ count: string }[]>(
    'SELECT COUNT(*)::bigint AS count FROM events',
  );
  const totalEvents = Number(countResult[0].count);
  console.log(`\nTotal events in DB: ${totalEvents.toLocaleString()}`);

  console.log('\nPhase 3: Benchmarking daily rollup...\n');

  const rangeResult = await dataSource.query<
    { min_date: Date | string; max_date: Date | string }[]
  >(
    `SELECT MIN("occurredAt") AS min_date, MAX("occurredAt") AS max_date FROM events`,
  );
  const rawMin = rangeResult[0]?.min_date;
  const rawMax = rangeResult[0]?.max_date;
  if (!rawMin || !rawMax) {
    console.log('No events found to rollup.');
    await dataSource.destroy();
    return;
  }

  const minDate = new Date(rawMin);
  minDate.setUTCHours(0, 0, 0, 0);
  const maxDate = new Date(rawMax);
  maxDate.setUTCHours(0, 0, 0, 0);
  maxDate.setTime(maxDate.getTime() + DAY_MS);

  console.log(
    `Event range: ${minDate.toISOString().slice(0, 10)} -> ${maxDate.toISOString().slice(0, 10)}`,
  );

  console.log('\nIndex verification (EXPLAIN ANALYZE):');
  const explainResult = await dataSource.query<{ 'QUERY PLAN': string }[]>(
    `EXPLAIN ANALYZE
     SELECT "eventType", date_trunc('day', "occurredAt")::date, COUNT(*)
     FROM events
     WHERE "occurredAt" >= $1 AND "occurredAt" < $2
       AND "eventType" IN (${TRACKED_EVENT_TYPES_SQL})
     GROUP BY 1, 2`,
    [minDate, new Date(minDate.getTime() + DAY_MS)],
  );
  for (const row of explainResult) {
    console.log(`  ${row['QUERY PLAN']}`);
  }

  const chunks: ChunkResult[] = [];
  let cursor = new Date(minDate);
  const rollupStart = Date.now();

  while (cursor.getTime() < maxDate.getTime()) {
    const chunkEnd = new Date(
      Math.min(cursor.getTime() + DAY_MS, maxDate.getTime()),
    );

    const t0 = Date.now();
    const result = await dataSource.query<{ count: string }[]>(
      `INSERT INTO daily_metrics ("metricType", "periodDate", "count")
       SELECT
         ${buildMetricTypeCaseSql('e."eventType"')},
         CAST(date_trunc('day', e."occurredAt") AS date) AS "periodDate",
         COUNT(*)::bigint AS "count"
       FROM events e
       WHERE e."occurredAt" >= $1 AND e."occurredAt" < $2
         AND e."eventType" IN (${TRACKED_EVENT_TYPES_SQL})
       GROUP BY 1, 2
       ON CONFLICT ("metricType", "periodDate") DO UPDATE
         SET "count" = EXCLUDED."count", "updatedAt" = now()
       RETURNING "metricType"`,
      [cursor, chunkEnd],
    );

    const durationMs = Date.now() - t0;
    chunks.push({
      day: cursor.toISOString().slice(0, 10),
      rows: result.length,
      durationMs,
    });

    cursor = chunkEnd;
  }

  const totalDuration = Date.now() - rollupStart;

  console.log('\nRollup Results:');
  console.log(
    `${'Day'.padEnd(12)} ${'Buckets'.padStart(8)} ${'Time (ms)'.padStart(10)}`,
  );
  console.log('-'.repeat(32));
  for (const c of chunks) {
    console.log(
      `${c.day.padEnd(12)} ${String(c.rows).padStart(8)} ${String(c.durationMs).padStart(10)}`,
    );
  }
  console.log('-'.repeat(32));

  const totalBuckets = chunks.reduce((s, c) => s + c.rows, 0);
  const avgMs =
    chunks.length > 0 ? Math.round(totalDuration / chunks.length) : 0;
  const maxMs = Math.max(...chunks.map((c) => c.durationMs), 0);

  console.log(
    `\nTotal:   ${chunks.length} days, ${totalBuckets} buckets, ${totalDuration}ms`,
  );
  console.log(`Average: ${avgMs}ms/day`);
  console.log(`Max:     ${maxMs}ms`);

  await dataSource.destroy();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
