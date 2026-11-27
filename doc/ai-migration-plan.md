# Repository AI Operating System Migration Plan

## Phase A: Centralize

1. Keep `AGENTS.md` as the canonical cross-client entry point.
2. Keep standards and security as the only repository-wide policy sources.
3. Keep testing, DevOps, and product files isolated by domain.
4. Use agent definitions only for ownership and escalation.

## Phase B: Consolidate Workflows

1. Use reusable SKILL.md files for feature, bug, test, review, security, migration, E2E, and Docker/release work.
2. Ignore framework-generic instructions that conflict with browser-only Athlima behavior.
3. Add new skills only when a workflow recurs and cannot be represented by a standards pointer.

## Phase C: Enforce Quality

1. Run lint, coverage, build, internal-link, and browser gates on pull requests.
2. Require container, secret, CodeQL, and dependency checks before publication.
3. Use the exact validated image for promotion.
4. Never publish from scheduled workflows.

## Phase D: Extend Test Evidence

1. Add Playwright critical journeys for ride, backup and settings flows.
2. Preserve fake IndexedDB and fixture conventions for lower-level tests.
3. Keep real hardware/provider testing in a separate evidence process.
4. Add Caddy/Compose runtime checks when infrastructure changes.

## Phase E: Governance

1. Configure branch protection and required workflow checks.
2. Require `production` environment reviewers.
3. Enable secret scanning and push protection.
4. Review Dependabot updates weekly.
5. Refresh security documentation counts after each audit or major test run.
