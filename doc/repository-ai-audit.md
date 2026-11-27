# Repository AI Operating System Audit

## Audit Scope

This audit covered AI instructions, agents, skills, documentation, source modules, tests, package scripts, Docker/Compose/Caddy/Nginx configuration, GitHub Actions, Dependabot, secret scanning, and browser automation configuration.

No source knowledge was replaced with framework-generic guidance. Repository-specific browser, Coach, storage, protocol, security, and release behavior remains authoritative.

## Current Inventory

- 5 specialized agents
- 8 repository skills
- 2 shared standards plus testing, DevOps, and product standards
- 97 Jest test files
- 996 active tests across 96 passing suites
- 1 skipped suite and 11 skipped tests
- No snapshots
- 1 Playwright Chromium test file
- 1 hardened publish workflow
- 1 Dependabot configuration
- 1 Gitleaks configuration
- 3 Compose variants and Caddy/Nginx static hosting

## Implemented Consolidation

- `AGENTS.md` is the cross-client entry point.
- Claude, Cline, Cursor, and Copilot use pointer files instead of duplicated instructions.
- Generic agents, instructions, and prompts were removed.
- Shared standards now cover architecture/development, testing, security, DevOps, and product behavior.
- Agent definitions contain responsibilities, authority, restrictions, escalation, inputs, outputs, and reused skills.

## Duplicate and Contradictory Knowledge Resolved

- Generic architecture, clean-code, security, Docker, CI, PRD, task, Vue, and accessibility personas were consolidated by repository role.
- Task instructions no longer imply automatic commits or publishing.
- Repository color and accessibility guidance now follows the existing brand and ride theme.
- Framework-generic backend, SQL, Vue, TypeScript, and server-auth examples are excluded from the browser-only system.

## Test Coverage

Baseline coverage is approximately:

- Statements: 69.63%
- Branches: 69.32%
- Functions: 66.82%
- Lines: 69.99%

The Jest threshold gate is set to statements 68%, branches 68%, functions 65%, and lines 69%.

### Highest-Priority Missing Tests

1. Real-browser ride start, interval, recovery, save and discard journeys.
2. Real-browser backup export, partial restore and credential exclusion.
3. Real-browser mobile/desktop resize with active ride state.
4. Malicious ZWO, FIT and backup-import scenarios.
5. Service-worker and offline update behavior in Chromium.
6. Caddy/HTTPS and Compose runtime smoke checks.
7. Re-enable practical FTMS/WCPS encoder cases and historical watch auto-start behavior only when fixtures permit meaningful assertions.

Hardware BLE/ANT+ behavior remains simulated until a real-device gate is available.

## CI/CD State

The workflow now has:

- Workflow lint
- Dependency review
- Secret scanning
- CodeQL
- Jest and coverage
- Parcel build
- Internal documentation link check
- Playwright Chromium
- Docker build and Trivy
- SBOM and provenance
- Cosign signature
- Artifact SHA verification
- Post-push smoke checks
- Scheduled audits

Scheduled runs validate but do not publish.

## Security State

The browser app uses trusted HTML sinks and generated CSP. Intervals.icu credentials remain browser-side and are excluded from backup exports. Container publication uses pinned digests, non-root runtime, immutable actions, signed artifacts, and exact image promotion.

Remaining external settings:

- Master branch protection
- Required workflow checks
- Production environment reviewers
- Repository secret-scanning and push-protection settings

## Missing Repository Governance

- Pull request and issue templates now exist.
- A coverage threshold now exists.
- A lint gate and Playwright gate now exist.
- Architecture decision records remain optional and should be created only for significant lasting decisions.

## Architecture Implementation Status

- Ride hand-offs are exposed through a separate outbox service and structured result report.
- Hash-route parsing is isolated in a reusable router module.
- State and event names have centralized constants and state-slice definitions.
- IndexedDB upgrades use a named migration registry.
- Backup restore now has validation, preparation, commit, and report stages.
- Parcel builds generate a current build asset manifest for service-worker offline caching.

