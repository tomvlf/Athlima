/** Exercises Phase 4/5 review controls, today guidance and XSS-safe summaries. */

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

describe('Adaptive Microcycle Engine review UI', () => {
    test('shows today guidance and review/dismiss remains side-effect free', async () => {
        const {service, panel} = await setup();
        const before = JSON.stringify(service.data);
        try {
            expect(panel.querySelector('[data-today-recommendation]')).not.toBeNull();
            await panel.click({target: panel.querySelector('[data-coach=microcycle-review]')});
            expect(panel.textContent).toContain('Proposed week update');
            expect(JSON.stringify(service.data)).toBe(before);
            await panel.click({target: panel.querySelector('[data-coach=microcycle-dismiss]')});
            expect(JSON.stringify(service.data)).toBe(before);
        } finally { panel.remove(); }
    });

    test('accept saves a reviewed caution candidate', async () => {
        const {service, panel} = await setup();
        try {
            service.data.safetyStatus = 'illness';
            await panel.click({target: panel.querySelector('[data-coach=microcycle-review]')});
            const revision = service.data.plan.revision;
            await panel.click({target: panel.querySelector('[data-coach=microcycle-accept]')});
            expect(service.data.plan.revision).toBe(revision + 1);
            expect(panel.textContent).toContain('accepted and saved');
            service.data.safetyStatus = null;
        } finally { panel.remove(); }
    });

    test('escapes summary and candidate values', () => {
        const panel = new CoachingPanel();
        panel.microcycleReview = {reasoning: '<img src=x onerror=alert(1)>', source: {revision: 1},
            window: {startDate: '2026-01-01', endDate: '2026-01-07'}, changes: [{action: 'added',
                workoutId: 'x', previous: null, current: {date: '2026-01-02', family: '<script>', duration: 3600}}],
            validationWarnings: []};
        document.body.append(panel);
        try {
            expect(panel.querySelector('[data-microcycle-review] img')).toBeNull();
            expect(panel.querySelector('[data-microcycle-review] script')).toBeNull();
        } finally { panel.remove(); }
    });
});
