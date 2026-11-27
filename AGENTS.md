# Agent Instructions

Read this file first, then load only the shared or agent-specific instructions needed for the task.

## Repository Reality

Too Many Watts / Athlima is a browser-only indoor training application. It is Parcel-bundled ES-module JavaScript, with no TypeScript or application backend. Training logic, Coach plans, rides, IndexedDB data, and settings execute in the browser. Intervals.icu is an optional direct browser integration.

## Required Reading

- For project conventions: `.github/instructions/athlima-standards.instructions.md`
- For security-sensitive work: `.github/instructions/athlima-security.instructions.md`
- For the task's architecture or domain: `README.md`, `doc/code-guide.md`, `doc/coaching.md`, `doc/backend.md`, or `doc/intervals-guide.md`
- For the selected role: `.github/agents/<agent>.agent.md`

## Agent Ecosystem

- `architect`: requirements, architecture, planning, and task decomposition
- `app-engineer`: application implementation across UI, Coach, storage, devices, FIT, workouts, and ride logic
- `security`: SAST/SCA, secrets, browser security, supply chain, and security review
- `devops`: Docker, Compose, Nginx/Caddy, GitHub Actions, releases, and observability
- `reviewer`: correctness, test quality, accessibility, performance, documentation, and merge readiness

## Shared Commands

- Install: `npm ci --ignore-scripts --no-audit --no-fund`
- Development: `npm start`
- HTTPS development: `npm run starttls`
- Focused test: `npm test -- --runInBand test/platform/ride.test.js`
- Test by name: `npm test -- --runInBand test/platform/ride.test.js -t "test name"`
- Full tests: `npm test -- --runInBand`
- Production build: `npm run build`
- Container build: `podman build -t athlima:local .` or `docker build -t athlima:local .`

## Execution Rules

- Preserve browser-only and local-data behavior. Do not introduce an account server or server-side Coach.
- Follow the smallest relevant test first, then the build or runtime check that covers changed behavior.
- Do not silently convert unavailable sensor/provider/history data into zero or an empty success.
- Preserve unit, ID, storage, Trusted Types, mobile-layout, and backup invariants in `.github/instructions/athlima-standards.instructions.md`.
- Do not commit, push, open a PR, alter GitHub Settings, or publish an image unless the user explicitly requests that operation.
- Stop and escalate when requirements are ambiguous, data formats or storage schemas may change incompatibly, security boundaries are unclear, or repository settings are required.

