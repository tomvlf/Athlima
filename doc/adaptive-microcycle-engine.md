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

The existing domain vocabulary remains authoritative: `CAPABILITIES` express goal demand, workout
`FAMILIES` express prescribed training, `estimateState()` produces dated athlete-state snapshots and
plans retain phases, weeks, workouts, adaptations and revisions.

## Phase 0: projection boundary

`projectMicrocycle()` provides a deterministic, read-only view over an existing plan and state
snapshot. It retains existing workout identities and does not persist or modify anything.

## Phase 1: planning context

`buildMicrocycleContext()` combines profile, goal, snapshot and plan into validated goal demand,
evidence-backed gaps, readiness/safety constraints, phase/week context and the current projection.

## Phase 2: candidate window

`buildMicrocycleCandidate()` asks the existing `adaptPlan()` engine to create an uncommitted candidate
revision. Caution and safety contexts use the established recovery adaptation; other contexts use a
feedback review. The result contains:

- the unchanged current projection;
- a candidate seven-day projection;
- a stable add/remove/modify diff keyed by workout ID;
- the validated candidate plan revision and its existing adaptation reasoning;
- validation warnings for review.

Candidate generation rejects stale contexts, preserves resolved and pre-window workouts, and verifies
that source plan and state objects were not mutated. It does not write to storage. This retains one
source of truth for workout rebuilding, load budgets, progression, return-to-training and validation.

## Future phases

1. constrain candidate rebuilding to richer availability and disruption scenarios;
2. present the candidate diff through existing explanation structures;
3. let `CoachingService` atomically accept a reviewed candidate as a normal revision;
4. add the Coach UI for "what changed" and today's recommendation.

## Non-goals

The current phases do not add persistent duplicate domain models, a second Coach facade, an IndexedDB
migration, UI changes, Train Now changes or LLM planning decisions.
