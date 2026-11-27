# Security AI Operating Review

## Scope

The review covers browser sinks, IndexedDB/local storage, backups, Intervals.icu credentials, ZWO/FIT/import parsers, Docker/Nginx/Compose/Caddy, GitHub Actions, dependency metadata, and secret scanning.

## Controls

- Dynamic markup uses `html`, `setHTML`, `insertHTML`, `parseXML`, and `trustedScriptURL`.
- Generated CSP and Trusted Types policy block arbitrary inline scripts and unsafe URL sinks.
- Untrusted ZWO, FIT, backup, provider, and URL values use validation or explicit error paths.
- API keys remain in browser storage and are excluded from backup exports.
- IndexedDB operations use checked transactions for loss-sensitive actions.
- Docker builds run tests before packaging.
- Actions and runtime images are pinned.
- CI forbids Docker socket mounts.
- Trivy, Gitleaks, CodeQL, SBOM, provenance, and Cosign protect publication.

## Dependency Audit

Transitive `glob` and `minimatch` findings were resolved through narrow package overrides. The final local npm audit found 0 vulnerabilities.

## Remaining Manual Evidence

- Real browser Trusted Types behavior across every screen.
- Real Caddy certificate/error-header behavior.
- Real BLE/ANT+ devices and smart trainers.
- Real Intervals.icu credential and sync behavior.
- Repository branch protection and production environment approval settings.

