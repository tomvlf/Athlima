/*
 * Connects Bluetooth Cycling Power updates to the cycling-power decoder.
 * onData receives watts and any optional measurements the sensor includes,
 * such as crank counters and calculated cadence. This service is read-only;
 * trainer resistance commands are handled by other service wrappers.
 */

//
// Cycling Power Service
//

import { expect } from '../../functions.js';
import { uuids, } from '../web-ble.js';
import { Service } from '../service.js';
import { Characteristic } from '../characteristic.js';
import { cyclingPowerMeasurement as cyclingPowerMeasurementParser } from './cycling-power-measurement.js';

// Wrap the discovered power service; shared setup/start/stop methods manage its measurement updates.
function CPS(args = {}) {
    // config
    // BluetoothRemoteGATTService{
    //     device: BluetoothDevice,
    //     uuid: String,
    //     isPrimary: Bool,
    // }
    const gattService = expect(
        args.service, 'CPS needs BluetoothRemoteGATTService!'
    );

    // {} -> Void
    const onData = args.onData;
    // end config

    // Service
    const spec = {
        measurement: {
            uuid: uuids.cyclingPowerMeasurement,
            notify: {callback: onData, parser: cyclingPowerMeasurementParser},
        },
    };
    const service = Service({service: gattService, spec,});

    return Object.freeze({
        ...service, // CPS will have all the public methods and properties of Service
    });
}

export default CPS;
