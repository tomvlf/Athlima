/**
 * Exercises Phase 3 review and acceptance through the real CoachingService persistence boundary.
 * Reviews are side-effect free; accepted candidates save snapshot, plan and revision atomically.
 */

import { CoachingService } from '../../src/coaching/service.js';
import { reviewMicrocycle, acceptMicrocycle } from '../../src/coaching/microcycle-service.js';
import { profile, goal, start, timestamp, history, memoryStorage } from './fixtures.js';

async function setup(storage = memoryStorage()) {
    const service = new CoachingService(storage, () => timestamp);
    await service.configure(profile, goal);
    await service.importActivities(history().map(activity => activity.original));
    await service.generate(start);
    return {service, storage};
}

describe('Adaptive Microcycle Engine Phase 3 service boundary', () => {
    test('review is side-effect free and acceptance atomically stores snapshot and revision', async () => {
        const {service, storage} = await setup();
        const before = JSON.stringify(service.data);
        const review = reviewMicrocycle(service, start);
        expect(JSON.stringify(service.data)).toBe(before);

        const previousRevisionCount = service.data.revisions.length;
        const accepted = await acceptMicrocycle(service, review);
        expect(accepted.revision).toBe(review.source.revision + 1);
        expect(service.data.plan).toEqual(review.candidatePlan);
        expect(service.data.snapshots.at(-1)).toEqual(review.state);
        expect(service.data.revisions).toHaveLength(previousRevisionCount + 1);
        expect(service.data.revisions.at(-1)).toEqual(review.candidatePlan);
        expect(new CoachingService(storage, () => timestamp).data).toEqual(service.data);
    });

    test('rejects stale, repeated and tampered candidates', async () => {
        const {service} = await setup();
        const stale = reviewMicrocycle(service, start);
        const current = reviewMicrocycle(service, start);
        await acceptMicrocycle(service, current);
        await expect(acceptMicrocycle(service, stale)).rejects.toThrow(/stale/);
        await expect(acceptMicrocycle(service, current)).rejects.toThrow(/stale|already/);

        const {service: fresh} = await setup();
        const tampered = reviewMicrocycle(fresh, start);
        tampered.candidatePlan.workouts[0].duration += 60;
        await expect(acceptMicrocycle(fresh, tampered)).rejects.toThrow(/changed after review/);
    });

    test('storage failure leaves live state and persisted state unchanged', async () => {
        const {service, storage} = await setup();
        const review = reviewMicrocycle(service, start);
        const before = clone(service.data);
        storage.setItem = () => { throw new Error('Quota exceeded'); };
        await expect(acceptMicrocycle(service, review)).rejects.toThrow('Quota exceeded');
        expect(service.data).toEqual(before);
    });

    test('requires an active in-range plan', async () => {
        const {service} = await setup();
        service.data.plan.status = 'archived';
        expect(() => reviewMicrocycle(service, start)).toThrow(/active/);
        service.data.plan.status = 'active';
        expect(() => reviewMicrocycle(service, '2025-12-31')).toThrow(/inside/);
    });
});

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
