---
name: docker-release
description: Build, scan, attest, sign, smoke-test, and promote Athlima container releases.
---

# Docker Release

Use `.github/instructions/athlima-devops.instructions.md`.

1. Build with the exact package lock and test/build gates.
2. Save and scan the image tar; never mount the Docker socket.
3. Verify non-root runtime, health, CSP, and route behavior.
4. Load only the SHA-verified artifact in publish.
5. Preserve SBOM, provenance, Cosign verification, and post-push smoke evidence.

