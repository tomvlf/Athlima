---
applyTo: "**/{Dockerfile,.dockerignore,compose*.yaml,Caddyfile,nginx.conf,.github/workflows/*.yml,.github/workflows/*.yaml,.github/dependabot.yml,scripts/*.mjs}"
description: Athlima container, hosting, CI/CD, and release standards
---

# Athlima DevOps Standards

## CI Gates

- Pull requests run workflow lint, unit/coverage tests, build validation, browser smoke tests, dependency review, secrets, CodeQL, and container policy checks.
- Main branch and tags run full validation before artifact promotion.
- Scheduled jobs refresh dependency, secret, container, and vulnerability information.
- CI fails on tests, coverage thresholds, build failure, HIGH/CRITICAL fixed vulnerabilities, secret findings, and workflow lint errors.

## Containers

- Use digest-pinned, fully qualified base images.
- The build stage uses `npm ci --ignore-scripts --no-audit --no-fund`.
- The runtime stage stays non-root, read-only where Compose requires it, and free of build dependencies.
- Never mount the Docker socket for vulnerability scanning.
- Generate CSP response headers from the exact built HTML.
- Preserve health, CSP, no-write, hidden-file, and non-GET protections.

## Release

- Promote the exact validated image artifact; do not rebuild and publish different bytes.
- Verify image SHA-256 before loading.
- Preserve SBOM, provenance, Cosign signature, image digest, and post-push smoke checks.
- Scheduled runs never publish.
- Tag or branch publication is allowed only by the approved `push` workflow and protected `production` environment.

