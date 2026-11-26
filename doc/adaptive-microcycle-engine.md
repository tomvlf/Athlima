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

`projectMicrocycle()` provides a deterministic, read-only projection of an existing plan and state
snapshot. It retains existing workout IDs, families, statuses, phase/week relationships, duration and
scheduled load. The projection is not stored and introduces no migration or behaviour change.

## Phase 1: planning context

`buildMicrocycleContext()` combines the existing authoritative inputs into the bounded context needed
by a future rebuild:

```text
profile + goal + estimateState snapshot + current plan
  -> goal demand and evidence-backed gaps
  -> readiness/safety gate
  -> active phase and intersecting weeks
  -> current seven-day projection
```

Phase 1 deliberately does not select, move or replace sessions. It validates that the profile, goal,
snapshot, sport and plan window belong together. Unknown readiness is kept unknown, a caution state
blocks quality eligibility, and pain/illness pauses the context. Goal demand and gap analysis reuse
`modelGoalDemand()` and `analyzeGaps()` rather than adding new stimulus scores.

## Future phases

1. build a candidate mutable future window from the Phase 1 context;
2. preserve resolved and frozen sessions;
3. validate volume, load, recovery, availability and sport constraints;
4. present a plan diff through existing adaptation/explanation structures;
5. commit an accepted candidate as a normal `CoachingService` plan revision.

## Non-goals

The current phases do not add persistent AthleteState, PlannedSession, MicrocyclePlan or CoachDecision
models, a second Coach facade, an IndexedDB migration, UI changes, Train Now changes or LLM planning.
