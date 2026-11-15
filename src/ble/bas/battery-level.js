/*
 * Reads the battery percentage from the first byte of a Bluetooth battery value.
 * A byte stores a small whole number; the standard expects 0–100 here.
 * The decoder wraps that number as {batteryLevel} without clamping or validation.
 */

//
// Battery Service Spec
// Battery Level (characteristic)
//

import { dataviewToArray, } from '../../functions.js';

// A stateless decoder: each call reads the supplied value, with no device access or saved history.
function BatteryLevel() {

    function decode(dataview) {
        const batteryLevel = dataview.getUint8(0, true); // 0-100, %

        return {
            batteryLevel,
        };
    }

    return Object.freeze({
        decode,
    });
}

const batteryLevel = BatteryLevel();

export {
    batteryLevel
}

