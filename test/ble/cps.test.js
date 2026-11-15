/*
 * Tests power-meter decoding from constructed Bluetooth messages: signed watts,
 * optional wheel/crank fields and their changing byte positions. Consecutive
 * crank samples check that cadence is calculated in revolutions/minute rather
 * than read from an unrelated optional field. No power meter is needed.
 */

import { CyclingPowerMeasurement } from '../../src/ble/cps/cycling-power-measurement.js';

// Turn a readable list of byte values into the same DataView shape provided by Bluetooth.
function view(bytes) {
    return new DataView(Uint8Array.from(bytes).buffer);
}

describe('Cycling Power Measurement', () => {
    test('decodes instantaneous power without optional fields', () => {
        expect(CyclingPowerMeasurement().decode(view([0, 0, 44, 1]))).toEqual({
            flags: 0,
            power: 300,
        });
    });

    test('decodes signed power', () => {
        expect(CyclingPowerMeasurement().decode(view([0, 0, 156, 255])).power).toBe(-100);
    });

    test('decodes wheel and crank fields at their wire offsets', () => {
        const measurement = CyclingPowerMeasurement();
        expect(measurement.decode(view([
            48, 0, 33, 0, 42, 0, 0, 0, 196, 96, 18, 0, 247, 4,
        ]))).toEqual({
            flags: 48,
            power: 33,
            cumulativeWheelRevolutions: 42,
            lastWheelEventTime: 24772 / 2048,
            cumulativeCrankRevolutions: 18,
            lastCrankEventTime: 1271 / 1024,
            cadence: 0,
        });
    });

    test('advances optional-field offsets before calculating cadence', () => {
        const measurement = CyclingPowerMeasurement();
        const first = [37, 0, 200, 0, 100, 64, 0, 1, 0, 0, 4];
        const second = [37, 0, 210, 0, 90, 96, 0, 2, 0, 0, 8];
        expect(measurement.decode(view(first))).toEqual({
            flags: 37, power: 200, pedalPowerBalance: 50, accumulatedTorque: 2,
            cumulativeCrankRevolutions: 1, lastCrankEventTime: 1, cadence: 0,
        });
        expect(measurement.decode(view(second))).toEqual({
            flags: 37, power: 210, pedalPowerBalance: 45, accumulatedTorque: 3,
            cumulativeCrankRevolutions: 2, lastCrankEventTime: 2, cadence: 60,
        });
    });
});
