# Adaptive Microcycle Engine

## Purpose

The Adaptive Microcycle Engine (AME) reviews the next seven days of an existing Athlima Coach plan. It
extends the deterministic Coach rather than creating a second planning system.

## Phases

- **Phase 0:** read-only seven-day projection.
- **Phase 1:** validated planning context and readiness gate.
- **Phase 2:** uncommitted candidate through `adaptPlan()`.
- **Phase 3:** stale-safe, tamper-checked atomic acceptance.
- **Phase 4:** explicit review, accept and dismiss UI.
- **Phase 5:** today's plan recommendation and concise change summary.
- **Phase 6:** bounded temporary availability and disruption input.
- **Phase 7:** automatic review triggers without automatic acceptance.
- **Phase 8:** transparent current-versus-candidate forecast comparison.
- **Phase 9:** compact accepted-review history over immutable plan revisions.

## Phase 9: revision history

`microcycleRevisionHistory()` reads the existing `data.revisions` archive and returns a bounded,
newest-first history of accepted microcycle decisions. Each entry contains revision continuity,
timestamp, trigger, snapshot identity, reasoning, change count, duration summary, load change and
warning count.

The Coach UI displays this audit trail as read-only details. Historical plans cannot be restored or
edited from this view. The helper returns cloned summaries and introduces no new store, schema or
persistence model. Existing immutable revisions remain the source of truth.

## Future phases

1. support multiple per-day limits and environment changes;
2. add opt-in notification surfaces for pending reviews;
3. improve accessibility and localisation of review summaries;
4. add export of the review audit trail to the existing coaching backup.

## Non-goals

The AME does not add duplicate persistent domain models, a second Coach facade, automatic acceptance,
revision rollback, Train Now replacement, physiological prediction or LLM planning decisions.
