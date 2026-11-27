/**
 * Historical, skipped auto-start scenario for an older watch interface. The watch import is
 * disabled and describe.skip prevents its assertions from running. Keep this distinction visible: a
 * skipped scenario is not proof that current ride timing behavior was tested.
 */

/**
 * @jest-environment jsdom
 */

import { JSDOM } from 'jsdom';

import { first, last, xf } from '../../src/functions.js';
// import { watch } from '../../src/watch.js';


describe('Watch', () => {

    global.console = {
        log: jest.fn(),
        error: console.error,
        warn: console.warn,
    };

    jest.useFakeTimers();

    const watch = {
        elapsed: 0,
        state: 'stopped',
        stateWorkout: 'stopped',
        autoStartCounter: 3,
        autoPauseCounter: 0,
        hasBeenAutoPaused: false,
        autoPause: true,
        autoStart: true,
    };

    describe.skip('auto start', () => {
        // first tick
        xf.dispatch('power', 0);
        jest.advanceTimersByTime(1000);

        test('0s', () => {
            expect(watch.elapsed).toBe(0);
            expect(watch.state).toBe('stopped');
            expect(watch.stateWorkout).toBe('stopped');
            expect(watch.autoStartCounter).toBe(3);
            expect(watch.autoPauseCounter).toBe(0);
            expect(watch.hasBeenAutoPaused).toBe(false);
            expect(watch.autoPause).toBe(true);
            expect(watch.autoStart).toBe(true);
        });
    });
});

