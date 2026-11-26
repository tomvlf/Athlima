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

## Phase 8: plan forecast comparison

`microcycleForecast()` aggregates scheduled sessions in a bounded projection: session count, training
days, minutes, planned load, quality/recovery counts, longest session and role distribution.
`compareMicrocycleForecasts()` shows the current and candidate values plus direct deltas.

This is deliberately a schedule forecast, not a physiological model. It does not estimate fatigue,
fitness, health, race outcome or injury risk. Missing planned load contributes zero rather than an
invented value, and completed sessions are excluded from future scheduled-work comparison.

The Coach review UI presents both columns before acceptance, while the detailed workout diff remains
the authoritative explanation of individual changes.

## Future phases

1. add a compact plan-revision history view;
2. support multiple per-day limits and environment changes;
3. add opt-in notification surfaces for pending reviews;
4. improve accessibility and localisation of review summaries.

## Non-goals

The AME does not add duplicate persistent domain models, a second Coach facade, automatic acceptance,
Train Now replacement, physiological prediction or LLM planning decisions.
