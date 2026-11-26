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

`reviewMicrocycle()` creates a fresh state snapshot and candidate on a cloned CoachingService state.
It does not change memory or storage. `acceptMicrocycle()` then:

1. rejects stale plan revisions and mismatched athlete, goal or snapshot identities;
2. deterministically rebuilds the proposal to detect tampering after review;
3. verifies revision and source-snapshot continuity;
4. stores the snapshot, accepted plan and immutable revision in one `CoachingService.commit()` call.

A failed storage write leaves the previous in-memory and persisted Coach state active. Candidates are
not accepted automatically, and a reviewed candidate becomes stale as soon as another plan revision
is committed.

## Future phases

1. expose review reasoning and changes through a Coach UI;
2. add today's recommendation and explicit accept/reject controls;
3. add richer availability and disruption input;
4. schedule automatic review triggers without automatic unsafe acceptance.

## Non-goals

The current phases do not add persistent duplicate domain models, a second Coach facade, an IndexedDB
migration, Train Now changes or LLM planning decisions.
