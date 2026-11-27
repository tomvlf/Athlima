---
name: feature-implementation
description: Implement an Athlima browser feature through the existing module boundaries, event bus, storage, Coach, UI, test, and documentation conventions.
---

# Feature Implementation

Use shared standards before editing.

1. Trace the user action through `src/platform/`, `src/views/`, `src/db.js`, and the responsible domain module.
2. Identify storage, unit, missing-data, mobile, and recovery behavior.
3. Add or update the nearest Jest test first or with the implementation.
4. Implement only the affected module boundaries.
5. Run the focused test, related suite, build, and browser smoke test when UI behavior changes.

