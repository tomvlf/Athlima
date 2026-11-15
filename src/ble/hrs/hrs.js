/*
 * Wires Bluetooth Heart Rate Service updates to the heart-rate decoder.
 * onData receives beats per minute, contact flags and any optional beat-to-beat
 * intervals in seconds. The shared Service wrapper manages subscriptions.
 */

//
// Heart Rate Service
//

import { expect, } from '../../functions.js';
import { uuids, } from '../web-ble.js';
import { Service } from '../service.js';
import { Characteristic } from '../characteristic.js';
import { heartRateMeasurement as heartRateMeasurementParser } from './heart-rate-measurement.js';

// Require a discovered heart-rate service and expose the shared setup/start/stop lifecycle.
function HRS(args = {}) {

    // config
    const onData = args.onData;

    // BluetoothRemoteGATTService{
    //     device: BluetoothDevice,
    //     uuid: String,
    //     isPrimary: Bool,
    // }
    const gattService = expect(
        args.service, 'HRS needs BluetoothRemoteGATTService!'
    );
    // end config

    // service
    const spec = {
        measurement: {
            uuid: uuids.heartRateMeasurement,
            notify: {callback: onData, parser: heartRateMeasurementParser},
        },
    };

    const service = Service({spec, service: gattService,});
    // end service

    return Object.freeze({
        ...service, // HRS will have all the public methods and properties of Service
    });
}

export default HRS;
