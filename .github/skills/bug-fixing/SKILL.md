---
name: bug-fixing
description: Reproduce and fix Athlima defects with a smallest-reliable test, preserving browser state, storage, and domain invariants.
---

# Bug Fixing

1. Reproduce the behavior and identify the state/event/storage boundary.
2. Add or adjust the nearest focused regression test.
3. Fix the root cause without broad unrelated cleanup.
4. Test missing, zero, retry, partial-failure, and resize cases when relevant.
5. Run the focused suite, nearest related suite, and build if the browser bundle changed.

