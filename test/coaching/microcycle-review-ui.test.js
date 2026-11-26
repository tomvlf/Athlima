/**
 * Exercises the Phase 4 review controls inside the existing coaching panel with the real local
 * service. Review and dismiss are side-effect free; accept persists one verified revision.
 */

/** @jest-environment jsdom */

import { IDBFactory } from 'fake-indexeddb';
import { initializeCoaching } from '../../src/coaching/service.js';
import { CoachingPanel } from '../../src/views/coaching-panel.js';
import '../../src/views/microcycle-review.js';
import { profile, goal, start, timestamp, history } from './fixtures.js';

async function setup() {
    const service = await initializeCoaching(new IDBFactory());
    service.clock = () => timestamp;
    if(!service.data.profile) {
        await service.configure(profile, goal);
        await service.importActivities(history().map(activity => activity.original));
        await service.generate(start);
    }
    const panel = new CoachingPanel();
    document.body.append(panel);
    return {service, panel};
}

describe('Adaptive Microcycle Engine Phase 4 UI', () => {
    test('review and dismiss do not change the active plan', async () => {
        const {service, panel} = await setup();
        const before = JSON.stringify(service.data);
        try {
            expect(panel.querySelector('[data-coach=microcycle-review]')).not.toBeNull();
            await panel.click({target: panel.querySelector('[data-coach=microcycle-review]')});
            expect(panel.textContent).toContain('Proposed week update');
            expect(JSON.stringify(service.data)).toBe(before);
            await panel.click({target: panel.querySelector('[data-coach=microcycle-dismiss]')});
            expect(panel.textContent).toContain('Review next 7 days');
            expect(JSON.stringify(service.data)).toBe(before);
        } finally {
            panel.remove();
        }
    });

    test('accept saves the reviewed candidate and clears the proposal', async () => {
        const {service, panel} = await setup();
        try {
            service.data.safetyStatus = 'illness';
            await panel.click({target: panel.querySelector('[data-coach=microcycle-review]')});
            const accept = panel.querySelector('[data-coach=microcycle-accept]');
            expect(accept).not.toBeNull();
            const revision = service.data.plan.revision;
            await panel.click({target: accept});
            expect(service.data.plan.revision).toBe(revision + 1);
            expect(panel.textContent).toContain('Review next 7 days');
            expect(panel.textContent).toContain('accepted and saved');
            service.data.safetyStatus = null;
        } finally {
            panel.remove();
        }
    });

    test('escapes candidate reasoning and session values', () => {
        const panel = new CoachingPanel();
        panel.microcycleReview = {reasoning: '<img src=x onerror=alert(1)>',
            source: {revision: 1}, window: {startDate: '2026-01-01', endDate: '2026-01-07'},
            changes: [{action: 'added', workoutId: 'x', previous: null,
                current: {date: '2026-01-02', family: '<script>', duration: 3600}}], validationWarnings: []};
        document.body.append(panel);
        try {
            expect(panel.querySelector('[data-microcycle-review] img')).toBeNull();
            expect(panel.querySelector('[data-microcycle-review] script')).toBeNull();
            expect(panel.textContent).toContain('<img src=x onerror=alert(1)>');
        } finally {
            panel.remove();
        }
    });
});
