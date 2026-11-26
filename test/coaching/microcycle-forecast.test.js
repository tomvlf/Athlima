/** Tests Phase 8 transparent current-versus-candidate forecast comparisons. */
import { microcycleForecast, compareMicrocycleForecasts } from '../../src/coaching/microcycle-forecast.js';

const projection = sessions => ({sessions});
const session = (id, date, role, duration, load, status = 'scheduled') =>
    ({workoutId: id, date, role, duration, scheduledLoad: load, status});

test('aggregates only scheduled sessions without mutating projections', () => {
    const input = projection([session('a', '2026-01-01', 'quality', 3600, 60),
        session('b', '2026-01-02', 'recovery', 1800, 15),
        session('done', '2026-01-03', 'endurance', 3600, 40, 'completed')]);
    const before = JSON.stringify(input);
    expect(microcycleForecast(input)).toEqual({sessions: 2, trainingDays: 2, minutes: 90, load: 75,
        qualitySessions: 1, recoverySessions: 1, longestMinutes: 60, roles: {quality: 1, recovery: 1}});
    expect(JSON.stringify(input)).toBe(before);
});

test('compares duration, load, quality, training days and longest session', () => {
    const current = projection([session('a', '2026-01-01', 'quality', 3600, 60),
        session('b', '2026-01-02', 'endurance', 3600, 40)]);
    const candidate = projection([session('a', '2026-01-01', 'recovery', 1800, 15)]);
    const result = compareMicrocycleForecasts(current, candidate);
    expect(result.delta).toMatchObject({sessions: -1, trainingDays: -1, minutes: -90, load: -85,
        qualitySessions: -1, recoverySessions: 1, longestMinutes: -30});
    expect(result.headline).toMatch(/90 planned minutes less/);
    expect(result.disclaimer).toMatch(/does not predict/);
});

test('handles missing load as unknown contribution instead of fabricating it', () => {
    expect(microcycleForecast(projection([session('a', '2026-01-01', 'endurance', 1800, null)])).load).toBe(0);
    expect(() => microcycleForecast({})).toThrow(/projected microcycle/);
});
