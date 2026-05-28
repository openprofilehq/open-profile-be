#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const { writeFileSync } = require('fs');

const args = process.argv.slice(2);

const outputIdx = args.indexOf('--output');
let outputPath;
if (outputIdx !== -1 && args[outputIdx + 1]) {
  outputPath = args[outputIdx + 1];
  args.splice(outputIdx, 2);
}

const [base, compare] = args;

if (!base || !compare) {
  console.error(
    'Usage: tools/release-cli.js [--output <file>] <base> <compare>',
  );
  console.error('  tools/release-cli.js staging dev');
  console.error('  tools/release-cli.js staging dev --output release.md');
  console.error('  Or: node tools/release-cli.js <base> <compare>');
  process.exit(1);
}

function runGit(cmdArgs) {
  return execFileSync('git', cmdArgs, { encoding: 'utf-8' }).trim();
}

try {
  runGit(['fetch', 'origin', base, compare]);
} catch (err) {
  console.warn(`\u26a0 Fetch failed for ${base}/${compare}: ${err.message}`);
}

const commits = runGit(['log', `${base}..${compare}`, '--pretty=format:%s'])
  .split('\n')
  .filter(Boolean);
const diffStat = runGit(['diff', '--stat', `${base}...${compare}`]);
const changedFiles = runGit(['diff', '--name-only', `${base}...${compare}`])
  .split('\n')
  .filter(Boolean);
const changedStatuses = runGit([
  'diff',
  '--name-status',
  `${base}...${compare}`,
])
  .split('\n')
  .filter(Boolean);

const groups = {
  feat: [],
  fix: [],
  refactor: [],
  chore: [],
  docs: [],
  test: [],
  perf: [],
  ci: [],
  other: [],
};
const groupTypes = Object.keys(groups);

for (const commit of commits) {
  let matched = false;
  for (const type of groupTypes) {
    if (type === 'other') continue;
    if (commit.startsWith(`${type}:`) || commit.startsWith(`${type}(`)) {
      groups[type].push(commit);
      matched = true;
      break;
    }
  }
  if (!matched) groups.other.push(commit);
}

const statusMap = {};
for (const s of changedStatuses) {
  const parts = s.split('\t');
  statusMap[parts[parts.length - 1]] = parts[0];
}

const hasMigrations = changedFiles.some((f) => /migration/i.test(f));
const hasInfra = changedFiles.some((f) =>
  /\.env|docker|compose|nginx|config/i.test(f),
);
const hasDeleted = changedStatuses.some((s) => s.startsWith('D'));
const riskyFiles = changedFiles.filter(
  (f) =>
    /\/auth\//.test(f) ||
    /entity/.test(f) ||
    /middleware|guard|interceptor/.test(f),
);

const typeLabels = {
  feat: 'Features',
  fix: 'Fixes',
  refactor: 'Refactors',
  chore: 'Chores',
  docs: 'Documentation',
  test: 'Tests',
  perf: 'Performance',
  ci: 'CI',
};

const defaultTitle = `chore: merge ${compare} into ${base}`;

const lines = [];

lines.push(`**${defaultTitle}**`);
lines.push('');
lines.push('# Release Summary');
lines.push('');
lines.push(`## Release\n${compare} → ${base}`);
lines.push('');

for (const [type, items] of Object.entries(groups)) {
  if (items.length === 0) continue;
  lines.push(`## ${typeLabels[type] || 'Other Changes'}`);
  for (const item of items) lines.push(`- ${item}`);
  lines.push('');
}

if (hasMigrations) {
  lines.push('## Database Changes');
  for (const f of changedFiles.filter((f) => /migration/i.test(f))) {
    const st = statusMap[f] || '';
    const label = st.startsWith('A')
      ? 'Added'
      : st.startsWith('D')
        ? 'Deleted'
        : 'Updated';
    lines.push(`- ${label} migration: \`${f}\``);
  }
  lines.push('');
}

if (hasInfra) {
  lines.push('## Infrastructure Changes');
  for (const f of changedFiles.filter((f) =>
    /\.env|docker|compose|nginx|config/i.test(f),
  ))
    lines.push(`- \`${f}\``);
  lines.push('');
}

if (riskyFiles.length > 0 || hasDeleted) {
  lines.push('## Risk Notes');
  if (hasDeleted) lines.push('- Files were deleted');
  for (const f of riskyFiles) {
    const reasons = [];
    if (/\/auth\//.test(f)) reasons.push('Auth module');
    if (/entity/.test(f)) reasons.push('Entity schema');
    if (/middleware|guard|interceptor/.test(f))
      reasons.push('Middleware/Guard/Interceptor');
    if (reasons.length > 0)
      lines.push(`- ${reasons.join(', ')} modified: \`${f}\``);
  }
  lines.push('');
}

lines.push('## File Change Summary');
lines.push('```');
lines.push(diffStat);
lines.push('```');
lines.push('');
lines.push('## Testing Checklist');
lines.push('- [ ] Application boots successfully');
lines.push('- [ ] Migrations tested');
lines.push('- [ ] Auth flow tested');
lines.push('- [ ] Regression tests pass');

const output = lines.join('\n');
console.log(output);
if (outputPath) {
  try {
    writeFileSync(outputPath, output, 'utf-8');
    console.error(`\n\u2713 Release summary written to ${outputPath}`);
  } catch (err) {
    console.error(`\n\u2717 Failed to write to ${outputPath}: ${err.message}`);
    process.exit(1);
  }
}
