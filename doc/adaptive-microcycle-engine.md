# Adaptive Microcycle Engine

## Purpose

The Adaptive Microcycle Engine (AME) will continuously review the next seven days of an existing
Athlima Coach plan. It is an extension of the current local, deterministic Coach, not a second Coach,
plan store or remote AI service.

## Existing architecture

Athlima already implements the authoritative coaching flow:

```text
raw activity
  -> normalizeActivity()
  -> estimateState()
  -> generatePlan() / adaptPlan()
  -> CoachingService commit
  -> snapshots and plan revisions
```

The existing domain vocabulary remains authoritative:

- `CAPABILITIES` express goal demand.
- workout `FAMILIES` express prescribed training.
- `estimateState()` produces dated athlete-state snapshots.
- generated plans contain phases, weeks and workouts.
- `plan.adaptations`, snapshots and revisions preserve explanations and history.

## Phase 0 boundary

`projectMicrocycle()` provides a deterministic, read-only projection of an existing plan and state
snapshot. It returns sessions for a bounded calendar window while retaining existing workout IDs,
families, statuses, phase/week relationships, duration and scheduled load.

The projection is deliberately not stored. It introduces no IndexedDB migration and does not change
current Coach behaviour.

```text
existing state snapshot + existing revised plan
  -> projectMicrocycle()
  -> seven-day read model
```

## Role mapping

Microcycle roles are scheduling and presentation hints only. They are derived from existing workout
families and do not replace family or capability vocabulary. Unknown families remain visible as
`maintenance` rather than being silently reclassified.

## Future phases

Later phases may use this boundary to compare a current seven-day projection with a candidate rebuilt
projection. Any accepted change must still pass through existing validation, adaptation, revision and
persistence mechanisms in `CoachingService`.

Planned responsibilities:

1. derive candidate weekly demand from an existing `estimateState()` snapshot;
2. rebuild only the mutable future window while preserving resolved and frozen sessions;
3. validate volume, load, recovery, availability and sport constraints;
4. present a plan diff using existing adaptation/explanation structures;
5. commit an accepted candidate as a normal plan revision.

## Non-goals

Phase 0 does not:

- introduce new AthleteState, PlannedSession, MicrocyclePlan or CoachDecision persistence models;
- add a second Coach facade;
- change `CoachingService`, IndexedDB, Train Now or the UI;
- allow an LLM to make planning decisions;
- modify generated or adapted plans.
