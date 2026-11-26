# Adaptive Microcycle Engine

## Purpose

The Adaptive Microcycle Engine (AME) continuously reviews the next seven days of an existing Athlima
Coach plan. It extends the current local, deterministic Coach rather than creating a second Coach,
plan store or remote AI service.

## Existing architecture

```text
raw activity
  -> normalizeActivity()
  -> estimateState()
  -> generatePlan() / adaptPlan()
  -> CoachingService commit
  -> snapshots and plan revisions
```

## Phase 0: projection boundary

`projectMicrocycle()` provides a deterministic, read-only view over an existing plan and state
snapshot while retaining existing workout identities.

## Phase 1: planning context

`buildMicrocycleContext()` combines profile, goal, snapshot and plan into validated goal demand,
evidence-backed gaps, readiness/safety constraints, phase/week context and the current projection.

## Phase 2: candidate window

`buildMicrocycleCandidate()` uses the existing `adaptPlan()` engine to create an uncommitted candidate
revision, candidate projection, stable workout diff, reasoning and validation warnings.

## Phase 3: review and atomic acceptance

`reviewMicrocycle()` performs a side-effect-free review. `acceptMicrocycle()` rejects stale or altered
proposals and atomically stores the snapshot, accepted plan and immutable revision.

## Phase 4: Coach review UI

The existing `<coaching-panel>` now exposes a Coach review card. The rider can:

1. request a fresh review of the next seven days;
2. inspect reasoning, the source revision, warnings and per-session add/remove/modify changes;
3. explicitly accept the verified proposal or dismiss it without changing the plan.

The UI never accepts automatically. Acceptance still passes through the Phase 3 stale-context,
identity, tamper and atomic-storage checks. All candidate text is escaped before rendering.

## Future phases

1. add today's recommendation and a concise "what changed" summary;
2. add richer availability and disruption input;
3. schedule automatic review triggers without automatic unsafe acceptance;
4. add forecast comparisons for current versus candidate microcycles.

## Non-goals

The current phases do not add persistent duplicate domain models, a second Coach facade, an IndexedDB
migration, Train Now changes or LLM planning decisions.
