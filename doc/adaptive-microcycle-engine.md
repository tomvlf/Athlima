# Adaptive Microcycle Engine

## Purpose

The Adaptive Microcycle Engine (AME) continuously reviews the next seven days of an existing Athlima
Coach plan. It extends the current deterministic Coach rather than creating a second planning system.

## Phases

- **Phase 0:** `projectMicrocycle()` provides a read-only seven-day projection.
- **Phase 1:** `buildMicrocycleContext()` combines validated plan, goal, state and readiness evidence.
- **Phase 2:** `buildMicrocycleCandidate()` creates an uncommitted candidate through `adaptPlan()`.
- **Phase 3:** review is side-effect free and acceptance is stale-safe, tamper-checked and atomic.
- **Phase 4:** the Coach dashboard exposes explicit review, accept and dismiss controls.
- **Phase 5:** the dashboard shows today's existing planned recommendation and a concise change summary.
- **Phase 6:** reviews accept bounded temporary availability and disruption input.

## Phase 6: temporary availability

A rider may mark dates in the seven-day window unavailable, set one temporary maximum session length
and add a short context note. `normalizeDisruptions()` validates that every date is inside the review
window and every limit is a whole number of minutes. `applyMicrocycleDisruptions()` then applies only
conservative changes:

- scheduled work on unavailable dates is removed;
- a session above a temporary limit is shortened while retaining its workout ID and family;
- a limit below the minimum session duration removes the session;
- omitted volume is never moved, stacked or made up on another day;
- resolved and pre-window sessions remain frozen;
- affected weekly scheduled minutes and load are recalculated.

Disruptions are included in deterministic reconstruction during Phase 3 acceptance, so changing the
input or candidate after review invalidates it. The inputs are stored only when the reviewed candidate
is explicitly accepted, inside the existing adaptation observations and reasoning.

## Future phases

1. schedule automatic review triggers without automatic unsafe acceptance;
2. add forecast comparisons for current versus candidate microcycles;
3. add a compact plan-revision history view;
4. support multiple per-day limits and environment changes.

## Non-goals

The AME does not add duplicate persistent domain models, a second Coach facade, an IndexedDB schema
migration, automatic acceptance, Train Now replacement or LLM planning decisions.
