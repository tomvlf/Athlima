/*
 * Connects a Moxy Bluetooth muscle-oxygen service to the sample decoder.
 * Its automatic updates become oxygen percentages, haemoglobin concentration
 * and sample metadata delivered through onData; no recording commands are sent here.
 */

//
// SmO2 Service
//

import { expect, } from '../../functions.js';
import { uuids, } from '../web-ble.js';
import { Service } from '../service.js';
import { Characteristic } from '../characteristic.js';
import { sensorData as smo2MeasurementParser } from './moxy.js';

// Use Service's shared setup/start/stop methods for the discovered Moxy measurement channel.
function SMO2(args = {}) {

    // config
    const onData = args.onData;

    // BluetoothRemoteGATTService{
    //     device: BluetoothDevice,
    //     uuid: String,
    //     isPrimary: Bool,
    // }
    const gattService = expect(
        args.service, 'SMO2 needs BluetoothRemoteGATTService!'
    );
    // end config

    // service
    const spec = {
        measurement: {
            uuid: uuids.smo2SensorData,
            notify: {callback: onData, parser: smo2MeasurementParser},
        },
    };

    const service = Service({spec, service: gattService,});
    // end service

    return Object.freeze({
        ...service, // SMO2 will have all the public methods and properties of Service
    });
}

export default SMO2;
