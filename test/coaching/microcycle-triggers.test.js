/** Tests Phase 7 automatic review triggers without automatic plan acceptance. */
import { microcycleReviewTrigger, markAutomaticReview } from '../../src/coaching/microcycle-triggers.js';
import { profile, start, state } from './fixtures.js';

function data(overrides = {}) {
    const snapshot = state();
    return {profile, safetyStatus: null, snapshots: [snapshot], plan: {id: 'plan', revision: 1,
        status: 'active', startDate: start, endDate: '2026-03-01', sourceSnapshot: snapshot.id,
        trainingPaused: false, adaptations: []}, ...overrides};
}

test('triggers safety, caution and new-evidence reviews with stable fingerprints', () => {
    const safety = microcycleReviewTrigger({data: data({safetyStatus: 'illness'}), now: `${start}T10:00:00Z`});
    expect(safety).toMatchObject({kind: 'safety', today: start});
    expect(microcycleReviewTrigger({data: data({safetyStatus: 'illness'}), now: `${start}T10:00:00Z`})).toEqual(safety);

    const cautiousState = state();
    cautiousState.readiness = {...cautiousState.readiness, status: 'caution'};
    expect(microcycleReviewTrigger({data: data({snapshots: [cautiousState]}), now: `${start}T10:00:00Z`}).kind).toBe('caution');

    const newer = state(); newer.id = 'new-state';
    expect(microcycleReviewTrigger({data: data({snapshots: [newer]}), now: `${start}T10:00:00Z`}).kind).toBe('evidence');
});

test('triggers a weekly review but stays quiet outside active plan dates', () => {
    expect(microcycleReviewTrigger({data: data(), now: '2026-01-08T10:00:00Z'}).kind).toBe('weekly');
    expect(microcycleReviewTrigger({data: data(), now: '2025-12-31T10:00:00Z'})).toBeNull();
    expect(microcycleReviewTrigger({data: data({plan: {...data().plan, status: 'archived'}}), now: `${start}T10:00:00Z`})).toBeNull();
});

test('records accepted automatic-review provenance in the existing adaptation', () => {
    const plan = {adaptations: [{observations: {date: start}}]};
    const trigger = {kind: 'weekly', reason: 'Due', today: '2026-01-08'};
    expect(markAutomaticReview(plan, trigger, '2026-01-08T10:00:00Z').adaptations[0].observations.microcycleReview)
        .toEqual({kind: 'weekly', reason: 'Due', date: '2026-01-08', reviewedAt: '2026-01-08T10:00:00Z'});
});
