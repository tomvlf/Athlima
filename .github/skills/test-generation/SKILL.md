---
name: test-generation
description: Generate meaningful Jest or Playwright coverage for Athlima business logic, browser journeys, storage, imports, and release behavior.
---

# Test Generation

Use `.github/instructions/athlima-testing.instructions.md`.

1. Prefer the nearest Jest test or Playwright only for a real critical browser journey.
2. Assert observable outcomes and failure semantics.
3. Use fake IndexedDB, mocked provider responses, fake timers, and fixture data.
4. Do not add snapshots or mark hardware behavior as proven by mocks.
5. Run the focused test and add coverage only when it protects a real risk.

