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

## Phase 5: today and what changed

`todayRecommendation()` selects today's existing scheduled session. It does not create an ad-hoc
workout or replace Train Now. Safety status pauses the recommendation; readiness caution asks the
rider to review the seven-day proposal before starting a non-recovery session; an empty day remains a
rest day rather than becoming catch-up work.

`microcycleChangeSummary()` reports stable add/modify/remove counts and the net duration difference of
the Phase 2 diff. The UI presents this summary before detailed per-session changes. All rendered data
remains escaped, and acceptance still uses the Phase 3 verification boundary.

## Future phases

1. add richer availability and disruption input;
2. schedule automatic review triggers without automatic unsafe acceptance;
3. add forecast comparisons for current versus candidate microcycles;
4. add a compact plan-revision history view.

## Non-goals

The AME does not add duplicate persistent domain models, a second Coach facade, an IndexedDB schema
migration, automatic acceptance, Train Now replacement or LLM planning decisions.
