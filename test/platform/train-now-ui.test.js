/** @jest-environment jsdom */
/**
 * Checks that Train Now is reachable from the dashboard, refuses to replace an unfinished ride, and
 * otherwise starts the generated ad-hoc workout without touching the plan or calendar. The
 * generator and engine are test doubles; the platform shell, route rendering and action wiring are
 * real.
 */
import { launchPlatform } from '../../src/platform/ui.js';
import { xf } from '../../src/functions.js';
import { db } from '../../src/db.js';
import { coachingData } from '../../src/coaching/service.js';
import { profile } from '../coaching/fixtures.js';
import { trainNowWorkout } from '../../src/coaching/train-now.js';
import intervals from '../../src/models/intervals.js';

jest.mock('../../src/index.js', () => {
    queueMicrotask(() => globalThis.window.dispatchEvent(new CustomEvent('app:ready')));
    return {};
});
jest.mock('../../src/db.js', () => ({db: {
    ftp: 250, weight: 75, elapsed: 0, lapTime: 0, watchStatus: 'stopped', workoutStatus: 'stopped',
    intervalIndex: 0, stepIndex: 0, activity: [], workouts: [],
    workout: {id: 'ride', meta: {name: 'Session', duration: 60}, intervals: [{duration: 60, steps: [{duration: 60, power: .8}]}]},
}}));
jest.mock('../../src/models/intervals.js', () => ({__esModule: true, default: {
    status: jest.fn(() => ({configured: true, connected: false, status: 'disconnected'})),
    connect: jest.fn(), sync: jest.fn(), syncProfile: jest.fn(),
}}));
jest.mock('../../src/coaching/service.js', () => ({
    coachingData: jest.fn(),
    coachingService: jest.fn(() => ({data: {}, revision: 1, syncPending: false, advance: jest.fn()})),
}));
jest.mock('../../src/coaching/train-now.js', () => ({trainNowWorkout: jest.fn()}));
jest.mock('../../src/functions.js', () => {
    const actual = jest.requireActual('../../src/functions.js');
    return {...actual, xf: {...actual.xf, dispatch: jest.fn(actual.xf.dispatch)}};
});

const settle = async () => { for(let i = 0; i < 20; i++) await Promise.resolve(); };

test('Train Now refuses an unfinished ride, then generates and starts an ad-hoc session', async () => {
    window.innerWidth = 1024;
    window.history.replaceState({}, '', '/');
    document.body.innerHTML = '<div id="platform"></div><div class="wrapper" hidden><training-calendar></training-calendar></div>';
    const calendar = document.querySelector('training-calendar');
    calendar.entriesForDate = () => [];
    calendar.plannedWorkouts = [];
    calendar.loadPlannedMonth = jest.fn().mockResolvedValue();
    coachingData.mockReturnValue({profile, goal: null, plan: null, activities: [], snapshots: []});
    trainNowWorkout.mockReturnValue({
        workout: {
            id: 'train-now:test', date: '2026-01-01', title: 'Train Now · Threshold 45 min',
            family: 'threshold', duration: 2700, steps: [{duration: 2700, power: 0.9}],
            trainNow: {reasoning: 'Threshold chosen because you were ready.'},
        },
        reasoning: 'Threshold chosen because you were ready.',
        signals: {},
    });
    const root = document.querySelector('#platform');
    await launchPlatform(root);
    await settle();

    const button = root.querySelector('[data-action="train-now"]');
    expect(button).not.toBeNull();
    expect(root.querySelector('.overview-today')).not.toBeNull();
    expect(root.querySelector('#daily-goal-form')).toBeNull();
    expect(root.querySelector('[data-today-goal-card]').textContent).toMatch(/set a goal/i);

    db.elapsed = 300;
    trainNowWorkout.mockClear();
    xf.dispatch.mockClear();
    button.click();
    await settle();
    expect(trainNowWorkout).not.toHaveBeenCalled();
    expect(xf.dispatch).not.toHaveBeenCalledWith('workout', expect.anything());
    expect(root.querySelector('#platform-message').textContent).toMatch(/finish and save/i);

    db.elapsed = 0;
    xf.dispatch.mockClear();
    button.click();
    await settle();
    expect(trainNowWorkout).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({profile}), asOf: expect.any(String),
    }));
    expect(xf.dispatch).toHaveBeenCalledWith('workout', expect.objectContaining({
        id: 'train-now:test', coachingWorkoutId: null,
        trainNow: {reasoning: 'Threshold chosen because you were ready.'},
    }));
    expect(xf.dispatch).toHaveBeenCalledWith('ui:watchStart');
    expect(xf.dispatch).toHaveBeenCalledWith('ui:workoutStart');
    expect(window.location.hash).toBe('#/player');

    const syncedData = {
        profile,
        goal: null,
        plan: null,
        activities: [{id: 'latest-intervals-ride', day: '2026-01-01'}],
        snapshots: [],
    };
    intervals.status.mockReturnValue({configured: true, connected: true, status: 'connected'});
    intervals.syncProfile.mockResolvedValue({ftp: profile.ftp, weight: profile.weight});
    intervals.sync.mockResolvedValue({connected: true, status: 'connected'});
    coachingData.mockReturnValue(syncedData);
    trainNowWorkout.mockClear();
    intervals.syncProfile.mockClear();
    intervals.sync.mockClear();
    xf.dispatch.mockClear();
    button.click();
    await settle();
    expect(intervals.syncProfile).toHaveBeenCalledTimes(1);
    expect(intervals.sync).toHaveBeenCalledTimes(1);
    expect(intervals.syncProfile.mock.invocationCallOrder[0])
        .toBeLessThan(intervals.sync.mock.invocationCallOrder[0]);
    expect(intervals.sync.mock.invocationCallOrder[0])
        .toBeLessThan(trainNowWorkout.mock.invocationCallOrder[0]);
    expect(trainNowWorkout).toHaveBeenCalledWith(expect.objectContaining({data: syncedData}));

    window.location.hash = '/';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await settle();
    trainNowWorkout.mockClear();
    intervals.syncProfile.mockRejectedValueOnce(new Error('Intervals.icu unavailable'));
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false);
    root.querySelector('[data-action="train-now"]').click();
    await settle();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('last known Coach data'));
    expect(trainNowWorkout).not.toHaveBeenCalled();
    expect(root.querySelector('#platform-message').textContent).toMatch(/cancelled/i);

    intervals.syncProfile.mockRejectedValueOnce(new Error('Intervals.icu unavailable'));
    confirm.mockReturnValueOnce(true);
    root.querySelector('[data-action="train-now"]').click();
    await settle();
    expect(trainNowWorkout).toHaveBeenCalledWith(expect.objectContaining({data: syncedData}));
    expect(root.querySelector('#platform-message').textContent).toMatch(/last known Coach data/i);
    confirm.mockRestore();

    const restData = {
        profile,
        goal: {name: 'Keep moving', type: 'general_fitness'},
        plan: {status: 'active', trainingPaused: false, workouts: [], adaptations: [], weeks: []},
        activities: [],
        snapshots: [],
        safetyStatus: null,
    };
    coachingData.mockReturnValue(restData);
    window.location.hash = '/';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    xf.dispatch('coaching:changed');
    await settle();
    const restPrompt = root.querySelector('[data-action="train-now"][data-rest-day="true"]');
    expect(restPrompt).not.toBeNull();
    expect(restPrompt.textContent).toMatch(/feeling like riding today/i);
    trainNowWorkout.mockClear();
    restPrompt.click();
    await settle();
    expect(trainNowWorkout).toHaveBeenCalledWith(expect.objectContaining({
        data: restData,
        restDay: true,
    }));
});
