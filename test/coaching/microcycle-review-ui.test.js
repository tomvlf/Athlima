/** Exercises Phase 4/5 review controls, today guidance and XSS-safe summaries. */

/** @jest-environment jsdom */

import { IDBFactory } from 'fake-indexeddb';
import { initializeCoaching } from '../../src/coaching/service.js';
import { CoachingPanel } from '../../src/views/coaching-panel.js';
import '../../src/views/microcycle-review.js';
import {
    todayRecommendationView,
    microcycleForecastView,
    microcycleHistoryView,
    microcycleReviewView,
} from '../../src/views/microcycle-review.js';
import { formatMicrocycleDate, formatMicrocycleTimestamp, formatMicrocycleNumber,
    formatMicrocycleMinutes } from '../../src/coaching/microcycle-format.js';
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
    test('formats AME dates, numbers and durations safely', () => {
        expect(formatMicrocycleDate('2026-02-30')).toBe('Unknown date');
        expect(formatMicrocycleDate('2026-01-01', 'en-US', 'UTC')).toMatch(/Jan/);
        expect(formatMicrocycleTimestamp('invalid')).toBe('Unknown time');
        expect(formatMicrocycleNumber(12.5, 1, 'en-US')).toBe('12.5');
        expect(formatMicrocycleMinutes(5400, 'en-US')).toBe('90 min');
    });

    test('supports repeatable day rules and removes extra rows', async () => {
        const {panel} = await setup();
        try {
            const form = panel.querySelector('[data-microcycle-disruptions]');
            expect(form).not.toBeNull();
            const add = panel.querySelector('[data-microcycle-add-row]');
            panel.click({target: add});
            expect(panel.querySelectorAll('[data-microcycle-row]').length).toBe(2);
            const remove = panel.querySelectorAll('[data-microcycle-remove-row]')[1];
            panel.click({target: remove});
            expect(panel.querySelectorAll('[data-microcycle-row]').length).toBe(1);
        } finally { panel.remove(); }
    });

    test('renders direct view helpers for recommendation, forecast and history', () => {
        expect(todayRecommendationView(null)).toBe('');
        expect(todayRecommendationView({
            status: 'review',
            title: '<b>Today</b>',
            reason: '<img src=x>',
            session: {family: 'threshold', duration: 2700, expectedRpe: 7},
        })).not.toContain('<b>');

        const forecast = microcycleForecastView({
            current: {sessions: [{
                workoutId: 'a', date: '2026-01-01', role: 'quality', duration: 3600,
                scheduledLoad: 60, status: 'scheduled',
            }]},
            candidate: {sessions: [{
                workoutId: 'a', date: '2026-01-01', role: 'recovery', duration: 1800,
                scheduledLoad: 15, status: 'scheduled',
            }]},
        });
        expect(forecast).toContain('Seven-day plan comparison');

        expect(microcycleHistoryView({revisions: []})).toBe('');
        expect(microcycleHistoryView({revisions: [{
            id: 'plan', revision: 2, sourceSnapshot: 'state-2',
            adaptations: [{
                previousRevision: 1, newRevision: 2, trigger: 'feedback',
                timestamp: '2026-01-02T10:00:00Z', reasoning: 'Evidence review',
                observations: {microcycleReview: {kind: 'weekly', reason: 'Seven days passed.'}},
                changes: [{action: 'modified', previous: {duration: 3600}, current: {duration: 2700}}],
                validationWarnings: [],
            }],
        }]})).toContain('Adaptive review history');
        expect(microcycleReviewView(null)).toContain('Temporary availability');
        expect(microcycleReviewView({
            reasoning: '<b>Review</b>',
            source: {revision: 2},
            window: {startDate: '2026-01-01', endDate: '2026-01-07'},
            changes: [],
            current: {sessions: []},
            candidate: {sessions: []},
        })).not.toContain('<b>');
    });

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
            current: {sessions: []}, candidate: {sessions: []}, validationWarnings: []};
        document.body.append(panel);
        try {
            expect(panel.querySelector('[data-microcycle-review] img')).toBeNull();
            expect(panel.querySelector('[data-microcycle-review] script')).toBeNull();
        } finally { panel.remove(); }
    });
});
