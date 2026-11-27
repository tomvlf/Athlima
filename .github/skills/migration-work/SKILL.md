---
name: migration-work
description: Plan and implement repository, data, workout, backup, protocol, or provider migrations with backward compatibility.
---

# Migration Work

1. Freeze the existing behavior or data shape before changing it.
2. Identify compatibility, backup, import/export, and rollback requirements.
3. Add migration-focused tests for old and current formats.
4. Preserve unrelated storage systems and never imply partial success is complete.
5. Update domain and backend documentation with the migration outcome.

