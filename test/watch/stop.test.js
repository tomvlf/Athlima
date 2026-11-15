/**
 * Checks the stop/save/discard decision with scripted confirmation answers, especially the exact
 * one-minute boundary. A discarded short ride must clear its recovery checkpoint first;
 * cancellation or a checkpoint-write failure must leave the ride unstopped.
 */
import { stopRide } from '../../src/activity/stop.js';

/**
 * Rows specify elapsed seconds, dialog answers, whether the ride is discarded and the expected
 * number of prompts; every row runs the same behavior check.
 */
test.each([
    [0, [true, false], true, 2],
    [59, [true, false], true, 2],
    [59, [true, true], false, 2],
    [60, [true], false, 1],
    [120, [true], false, 1],
])('finishing a %i-second ride handles save or discard', async (elapsed, answers, discarded, prompts) => {
    const confirmStop = jest.fn();
    answers.forEach(answer => confirmStop.mockReturnValueOnce(answer));
    const clearCheckpoint = jest.fn().mockResolvedValue();
    const stop = jest.fn();
    await stopRide({elapsed, confirmStop, clearCheckpoint, stop});
    expect(confirmStop).toHaveBeenCalledTimes(prompts);
    expect(clearCheckpoint).toHaveBeenCalledTimes(discarded ? 1 : 0);
    expect(stop).toHaveBeenCalledWith(discarded);
});

test('cancelling stop leaves the ride alone', async () => {
    const stop = jest.fn(), clearCheckpoint = jest.fn();
    await stopRide({elapsed: 10, confirmStop: () => false, clearCheckpoint, stop});
    expect(stop).not.toHaveBeenCalled();
    expect(clearCheckpoint).not.toHaveBeenCalled();
});

test('a failed discard checkpoint does not stop or lose the ride', async () => {
    const stop = jest.fn();
    await expect(stopRide({elapsed: 10, confirmStop: jest.fn().mockReturnValueOnce(true).mockReturnValueOnce(false),
        clearCheckpoint: () => Promise.reject(new Error('Storage unavailable')), stop})).rejects.toThrow('Storage unavailable');
    expect(stop).not.toHaveBeenCalled();
});
