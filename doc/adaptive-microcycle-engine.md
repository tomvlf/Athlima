# Adaptive Microcycle Engine

## Purpose

The Adaptive Microcycle Engine (AME) continuously reviews the next seven days of an existing Athlima
Coach plan. It extends the current deterministic Coach rather than creating a second planning system.

## Phases

- **Phase 0:** read-only seven-day projection.
- **Phase 1:** validated planning context and readiness gate.
- **Phase 2:** uncommitted candidate through `adaptPlan()`.
- **Phase 3:** stale-safe, tamper-checked atomic acceptance.
- **Phase 4:** explicit review, accept and dismiss UI.
- **Phase 5:** today's plan recommendation and concise change summary.
- **Phase 6:** bounded temporary availability and disruption input.
- **Phase 7:** automatic review triggers without automatic acceptance.

## Phase 7: automatic review triggers

`microcycleReviewTrigger()` deterministically recommends a fresh review when:

- pain, illness or a paused plan is present;
- the latest readiness snapshot reaches caution;
- a newer state snapshot exists than the plan source snapshot;
- seven days have passed since the last accepted review or plan decision.

A trigger contains a stable fingerprint for the plan revision, snapshot, local date and readiness
state. The dashboard may prepare one in-memory proposal per fingerprint. It never accepts or persists
a candidate automatically. Every proposal still requires explicit rider acceptance through Phase 3.

When accepted, trigger provenance is written into the existing adaptation observations. No new store,
schema migration, background service or duplicate plan model is introduced.

## Future phases

1. add forecast comparisons for current versus candidate microcycles;
2. add a compact plan-revision history view;
3. support multiple per-day limits and environment changes;
4. add opt-in notification surfaces for pending reviews.

## Non-goals

The AME does not add duplicate persistent domain models, a second Coach facade, automatic acceptance,
Train Now replacement or LLM planning decisions.
