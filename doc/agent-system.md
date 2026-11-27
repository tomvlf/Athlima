# Repository Agent Ecosystem

## Existing Instructions Reused

- `AGENTS.md` did not exist. It is now the cross-client entry point.
- `.github/copilot-instructions.md` was the primary repository-specific Copilot file. Its project startup, architecture, units, storage, security, and test knowledge is preserved in shared standards.
- `README.md`, `doc/code-guide.md`, `doc/backend.md`, `doc/coaching.md`, `doc/intervals-guide.md`, and `doc/security-hardening-plan.md` provide repository-specific architecture and domain knowledge.
- `.github/instructions/` contributed security, accessibility, Docker, GitHub Actions, PRD/task workflows, and review themes.
- `.github/agents/` contributed architecture, debugging, clean-code, frontend, accessibility, Playwright, security, GitHub Actions, PRD, and refactoring roles.
- `.github/prompts/` contributed PRD, task-generation, and task-execution workflows.
- `brand-guidelines.md` remains the source of truth for visual identity and overrides generic HTML/CSS color guidance.
- Five reusable repository skills now cover feature implementation, bug fixing, test generation, code review, security review, Docker/release, browser E2E, and migration work.

## Existing Standards

- Browser-only architecture with no account or application backend
- Node 22.18+, npm, Parcel, Jest/jsdom, IndexedDB, and local browser storage
- `xf` event bus and top-level Proxy notifications
- `html`/Trusted Types sinks and generated CSP
- 700 px mobile breakpoint and `body.mobile-app`
- FTP/fraction, seconds/minutes, metres/kilometres, pace, and missing-data rules
- Stable `builtin-${index}` workout IDs
- Docker/Nginx pinned release flow
- Trivy, Gitleaks, CodeQL, provenance, SBOM, and Cosign checks
- Nearest-test-first and full-test/build validation

## Existing Workflows

- PRD discovery and task decomposition
- TDD/refactor and issue completion
- Browser, accessibility, and performance investigation
- Docker build/test/publish
- GitHub Actions lint, dependency review, secret scan, CodeQL, image scan, smoke test, attestation, and signing

## Classification

### Architecture

Browser entry, module boundaries, event/state model, storage systems, Coach, devices, FIT, workouts, backup/migration, and deployment topology.

### Development

ES-module JavaScript patterns, unit/domain invariants, markup sinks, CSS/mobile conventions, focused testing, and documentation updates.

### Security

Trusted Types/CSP, untrusted imports, backups and credentials, supply-chain pins, secret handling, container permissions, and vulnerability gates.

### DevOps

Docker, Compose, Caddy, Nginx, GitHub Actions, artifact promotion, signing, SBOM, provenance, smoke tests, and Dependabot.

### Quality

Jest/jsdom/Node tests, fixtures, skipped-test interpretation, browser smoke tests, accessibility, performance, runtime evidence, and review severity.

## Duplicates

- Architecture: architect, repo-architect, principal, and Copilot instructions.
- Clean code: clean-code, principal, generic review, and TDD/refactor agents.
- Security: SAST, security instructions, TDD/refactor, GitHub Actions, and Docker guidance.
- DevOps: GitHub Actions agent and CI instruction.
- Browser quality: accessibility, Playwright, performance, Vue, and HTML/CSS instructions.
- PRD/tasks: PRD agent, PRD instructions/prompt, task agent/instructions/prompts.

## Contradictions

- Generic task instructions require per-subtask approval and automatic staging/committing. Athlima instructions do not establish that rule and the consolidated system requires explicit authorization for commits/publishing.
- Generic HTML/CSS guidance bans magenta and hot accent colors, while the repository explicitly uses cyberpunk magenta/cyan/yellow and brand guidelines. Repository guidance takes precedence.
- Generic frameworks include SQL/backend/Vue/TypeScript patterns that do not apply to this browser-only ES-module application.
- Generic task instructions treat `/tasks` and a Junior Developer audience as defaults. Athlima has no such convention.
- Generic security instructions contain broad server/SQL/JWT examples not grounded in the browser-only architecture.

## Missing Guidance

- Root `AGENTS.md`
- Claude, Cline, Cursor, and OpenHands compatibility pointers
- Repository-specific shared standards
- Explicit agent authority/restriction/escalation contracts
- Single ownership model across app, security, DevOps, and review
- Migration guidance separating reusable knowledge from framework-generic noise

## Proposed Structure

```text
AGENTS.md
CLAUDE.md
.clinerules
.cursor/rules/athlima.mdc
.github/
  agents/
    architect.agent.md
    app-engineer.agent.md
    security.agent.md
    devops.agent.md
    reviewer.agent.md
  instructions/
    athlima-standards.instructions.md
    athlima-security.instructions.md
  copilot-instructions.md
doc/
  agent-system.md
```

## Migration Plan

1. Use shared standards and security files as the source of truth.
2. Replace generic or duplicate `.github/agents/*.agent.md` files with the five role definitions.
3. Replace `.github/copilot-instructions.md` with a compatibility entry pointing to shared knowledge.
4. Remove generic instruction and prompt duplicates.
5. Keep specialized scripts and workflows only when they are repository repeatable tasks.
6. Validate one prompt in Copilot, Claude Code, Cline, Cursor, and an AGENTS-compatible OpenHands setup.

## Rationale

- Five roles avoid duplicating architecture, implementation, security, DevOps, and review ownership.
- `app-engineer` replaces `backend` because this repository has no application backend.
- Security and DevOps remain separate because code/data boundaries differ from build/release infrastructure.
- Reviewer is read-only by default and escalates merge blockers.
- Shared files reduce token usage and prevent client-specific drift.
- Pointer files preserve Claude/Cline/Cursor compatibility.
- `AGENTS.md` is the cross-client canonical entry point.
