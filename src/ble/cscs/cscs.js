/*
 * Wires the Cycling Speed and Cadence service to its measurement decoder.
 * Automatic Bluetooth updates become wheel/crank counters, event times in
 * seconds and calculated cadence, then go to the supplied onData callback.
 */

//
// Cycling Speed and Cadence Service
//

import { expect } from '../../functions.js';
import { uuids, } from '../web-ble.js';
import { Service } from '../service.js';
import { Characteristic } from '../characteristic.js';
import { cscMeasurement as cscMeasurementParser } from './cycling-speed-cadence-measurement.js';

// Use the shared Service lifecycle to start and stop the discovered sensor's updates.
function CSCS(args = {}) {

    // config

    // BluetoothRemoteGATTService{
    //     device: BluetoothDevice,
    //     uuid: String,
    //     isPrimary: Bool,
    // }
    const gattService = expect(
        args.service, 'HRS needs BluetoothRemoteGATTService!'
    );

    const onData = args.onData;
    // end config

    // Service
    const spec = {
        measurement: {
            uuid: uuids.speedCadenceMeasurement,
            notify: {callback: onData, parser: cscMeasurementParser},
        },
    };
    const service = Service({service: gattService, spec,});

    return Object.freeze({
        ...service,
    });
}

export default CSCS;
