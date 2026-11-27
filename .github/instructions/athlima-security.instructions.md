---
applyTo: "**/*.{js,mjs,html,css,yml,yaml,Dockerfile}"
description: Athlima security boundaries and browser/container supply-chain requirements
---

# Athlima Security

## Threat Model

The app is browser-only. Protect browser state, IndexedDB, backups, local Intervals.icu credentials, untrusted imported files, device protocols, build artifacts, and published static images. The static host is not an application data server.

## Browser Security

- Route provider/user data through `html`, `textOf`, `setHTML`, `insertHTML`, and `trustedScriptURL`.
- Preserve the generated CSP and Trusted Types policy. Never add unsafe inline script allowances or arbitrary innerHTML sinks.
- Re-run `scripts/write-security-headers.mjs` after built HTML or import-map changes.
- Keep no secrets in backup exports or bundled application code.
- Intervals.icu credentials stay browser-side and are excluded from backups.

## Untrusted Data

- ZWO, FIT, backup JSON, provider responses, and URL-derived values are untrusted.
- Preserve size, shape, range, missing-value, and partial-restoration checks.
- A malformed or unavailable input must produce an explicit error or review state, not invented values.

## Storage and Privacy

- Live state, IndexedDB, downloaded backups, provider copies, and pending Coach handoffs are distinct.
- Do not make a storage failure look like success.
- Preserve recovery checkpoints and transaction boundaries for ride save/discard flows.
- Backups contain private training data and must not include API credentials.

## Supply Chain

- Pin GitHub Actions and container images to immutable SHAs or digests.
- Keep workflow permissions read-only unless a specific write is required.
- Never mount the Docker socket into scanners or workflows.
- Keep `npm ci --ignore-scripts --no-audit --no-fund` and existing test/build gates before publication.
- Reject or remediate HIGH/CRITICAL fixed vulnerabilities through the established Trivy policy.
- Preserve provenance, SBOM, image signing, and exact validated-image promotion.

## Secrets

- Never print, commit, or place secrets in examples, logs, environment names, artifacts, or CSP values.
- Use GitHub Secrets or environment protection; no static cloud credentials in this repository.
- Gitleaks and native secret scanning findings require source review. Do not add a broad allowlist unless the finding is demonstrably false and narrowly scoped.

## Escalation

- Stop for a suspected credential exposure, malicious data behavior, CSP weakening, auth boundary change, package compromise, signing-key issue, or production environment change.
- Report exact affected files, data flows, severity, and remediation; do not silently relax a security gate.

