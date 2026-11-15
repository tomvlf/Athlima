/*
 * Connects a CORE temperature sensor's Bluetooth updates to its decoder.
 * onData receives body/skin temperatures normalized to Celsius, plus any
 * optional fields included by the sensor.
 */

//
// Core Temp Service
//

import { expect, } from '../../functions.js';
import { uuids, } from '../web-ble.js';
import { Service } from '../service.js';
import { Characteristic } from '../characteristic.js';
import { coreBodyTemperature as coreBodyTemperatureParser } from './core-body-temperature.js';

// Wrap the discovered temperature service; setup/start/stop are supplied by Service.
function CoreTemp(args = {}) {

    // config
    const onData = args.onData;

    // BluetoothRemoteGATTService{
    //     device: BluetoothDevice,
    //     uuid: String,
    //     isPrimary: Bool,
    // }
    const gattService = expect(
        args.service, 'CoreTemp needs BluetoothRemoteGATTService!'
    );
    // end config

    // service
    const spec = {
        measurement: {
            uuid: uuids.coreBodyTemp,
            notify: {callback: onData, parser: coreBodyTemperatureParser},
        },
    };

    const service = Service({spec, service: gattService,});
    // end service

    return Object.freeze({
        ...service, // CoreTemp will have all the public methods and properties of Service
    });
}

export default CoreTemp;

