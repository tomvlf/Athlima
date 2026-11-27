/** @jest-environment jsdom */
import { deviceControl } from '../../src/ble/moxy/moxy.js';

test('Moxy device control preserves update type and compound radio settings', () => {
    const buffer = deviceControl.encode({
        dataControl: deviceControl.values.dataControl.start,
        updateType: deviceControl.values.updateType['5HzDataSmoothing'],
    });
    const view = new DataView(buffer);

    expect(view.getUint8(0)).toBe(3);
    expect(view.getUint8(1)).toBe(5);
    expect(view.getUint8(2)).toBe(0);
});

test('Moxy device control exposes unique update and profile values', () => {
    expect(new Set(Object.values(deviceControl.values.updateType)).size)
        .toBe(Object.keys(deviceControl.values.updateType).length);
    expect(new Set(Object.values(deviceControl.values.antProfile)).size)
        .toBe(Object.keys(deviceControl.values.antProfile).length);
});
