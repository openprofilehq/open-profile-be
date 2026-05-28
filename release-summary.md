# Release Summary Generator

Automatically generates structured markdown release summaries by comparing two git branches.

## Purpose

When promoting code between environments (`dev → staging` or `staging → production`), this tool collects all commits, groups them by conventional commit type, detects migrations and risky changes, and outputs a formatted PR summary ready to paste.

## Usage

```bash
pnpm release:staging
pnpm release:prod
```

Or directly:

```bash
node tools/release-cli.js <base> <compare>
```

### Examples

```bash
node tools/release-cli.js staging dev
node tools/release-cli.js production staging
node tools/release-cli.js staging dev --output release-summary.md # write to file
```

## Output

The tool prints a markdown document containing:

- **Release** — branch names being compared
- **Features / Fixes / Refactors / etc.** — commits grouped by conventional commit type
- **Database Changes** — automatically detected migrations
- **Infrastructure Changes** — detected env/docker/config changes
- **Risk Notes** — auth module changes, entity schema updates, deleted files, middleware changes
- **File Change Summary** — full diff stat
- **Testing Checklist** — standard pre-release checklist
