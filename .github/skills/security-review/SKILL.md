---
name: security-review
description: Review Athlima source, dependencies, secrets, browser sinks, imports, container configuration, and GitHub Actions for security risk.
---

# Security Review

Use `.github/instructions/athlima-security.instructions.md`.

1. Trace untrusted ZWO, FIT, backup, provider, URL, and browser input to its sink.
2. Check CSP, Trusted Types, secrets, storage, transaction, and recovery behavior.
3. Review dependencies, Docker, workflow permissions, action pins, and artifact signing.
4. Report findings by severity with exact evidence and a concrete patch.
5. Do not weaken security gates or broaden Gitleaks allowlists for convenience.

