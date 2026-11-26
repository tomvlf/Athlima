/** Tests the simplified goal boundary without adding a second Coach data model. */

import { normalizeQuickGoal, quickProfile, missingQuickProfileFields } from '../../src/coaching/daily-coach.js';
import { profile } from './fixtures.js';

test('normalizes cycling and running quick goals to concrete dates', () => {
    expect(normalizeQuickGoal({
        sport: 'cycling', type: 'gran_fondo', horizon: 91, today: '2026-01-01',
    })).toMatchObject({type: 'gran_fondo', date: '2026-04-02', active: true});
    expect(normalizeQuickGoal({
        sport: 'running', type: 'run_10k', date: '2026-03-01', today: '2026-01-01',
    })).toMatchObject({type: 'run_10k', date: '2026-03-01', active: true});
});

test('rejects today, past, invalid and unsupported quick timelines', () => {
    expect(() => normalizeQuickGoal({
        sport: 'cycling', type: 'gran_fondo', horizon: 91, date: '2026-01-01', today: '2026-01-01',
    })).toThrow(/after today/);
    expect(() => normalizeQuickGoal({
        sport: 'running', type: 'gran_fondo', horizon: 91, today: '2026-01-01',
    })).toThrow(/supported goal/);
    expect(() => normalizeQuickGoal({
        sport: 'cycling', type: 'gran_fondo', horizon: 0, today: '2026-01-01',
    })).toThrow(/timeline/);
});

test('preserves advanced profile fields across sport switches', () => {
    const switched = quickProfile(profile, 'running');
    expect(switched).toMatchObject({
        id: profile.id,
        weight: profile.weight,
        ftp: profile.ftp,
        experience: profile.experience,
        availableDays: profile.availableDays,
        sport: 'running',
    });
});

test('reports missing quick-plan inputs instead of inventing values', () => {
    expect(missingQuickProfileFields(null)).toContain('body weight');
    expect(missingQuickProfileFields({...profile, weight: null})).toContain('body weight');
    expect(missingQuickProfileFields({...profile, adultAthleteConfirmed: false}))
        .toContain('adult confirmation');
});

test.each([42, 91, 182, 365])('accepts timeline choice %i days', horizon => {
    expect(normalizeQuickGoal({
        sport: 'cycling',
        type: 'gran_fondo',
        horizon,
        today: '2026-01-01',
    }).date).toBe(new Date(Date.parse(`2026-01-01T00:00:00Z`) + horizon * 86400000)
        .toISOString().slice(0, 10));
});
