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
- **Phase 10:** repeatable temporary availability, duration, environment and per-day context rules.
- **Phase 11:** accessible, centralised review presentation and formatting.
- **Phase 12:** exportable, derived microcycle audit trail in coaching backups.
- **Phase 13:** minimal persisted dismissal and seen status by fingerprint.
- **Phase 14:** privacy-safe local diagnostics with stable error codes.
- **Phase 15:** end-to-end stale, tamper, storage and plan-boundary hardening.

## Phase 10: extended temporary availability

The review UI uses repeatable day rules instead of comma-separated dates. Each rule can mark a date
unavailable, set a maximum session duration, request indoor, outdoor or either environments, and
add a short per-day note.

`normalizeDisruptionRows()` detects duplicate dates and `normalizeDisruptions()` rejects out-of-window
dates, invalid durations, unknown environments and invalid per-day notes. Candidate generation applies
these rules to the existing plan only; it does not move or distribute removed load.

Environment changes preserve workout identity and never increase duration, load, intensity or
progression. When an existing workout cannot support the requested environment, the candidate tries
only the existing validated workout library. If no conservative library variant fits, the session is
removed. The existing accepted-candidate rebuilding process repeats the same normalized input so
tampering between review and acceptance is rejected.

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
