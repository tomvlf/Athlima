/*
 * Wires a Bluetooth service to its message decoders and app callbacks. A service
 * groups related device features; each characteristic is one readable/writable
 * value or source of updates. GATT is Bluetooth's service/characteristic system,
 * and a UUID is the long identifier used to find a particular feature.
 * The spec below says which incoming values to decode and where to deliver them.
 */

import { equals, exists, expect, compose2, dataviewToArray, print, } from '../functions.js';
import { webBle, uuids } from './web-ble.js';
import { Characteristic } from './characteristic.js';

// TODO:
// - add support for mapping write methods to parsers in the service spec object,
//   like 'write' for the WRITE property of a characteristic
// - in the start() methods handle startNotificationWithRetry fail if something fails
//   we need to disconnect the device

// Usage:
//
// function onData(msg) {
// // do something with the decoded data message
// }
//
// function onControl(msg) {
// // do something with the decoded response message
// }
//
// const spec = {
//     measurement: {
//         uuid: uuids.indoorBikeData,
//         notify: {callback: onData, parser: indoorBikeDataParser},
//     },
//     control: {
//         uuid: uuids.fitnessMachineControlPoint,
//         notify: {callback: onControl, parser: controlResponseParser},
//     },
// };
//
// const service = Service({service: BluetoothRemoteGATTService, spec,});
// await service.setup();
//
// service.characteristcics?.control.write(Dataview);
//
/**
 * Wrap an already-discovered browser service. setup finds characteristics, starts
 * updates, then runs any device-specific handshake. start/stop manage those
 * updates, and isStarted reports the local lifecycle flag.
 */
function Service(args = {}) {

    // config
    // BluetoothRemoteGATTService{
    //     device: BluetoothDevice,
    //     uuid: String,
    //     isPrimary: Bool,
    // }
    const _service = expect(
        args.service, 'Service needs BluetoothRemoteGATTService!'
    );

    // String
    const _name = args.name ?? webBle.uuidToName(_service.uuid);

    // spec, is the declarative specification of the characteristics under this service
    //
    // the structure of a spec object is the following:
    // {
    //     <characteristic-class>?: {
    //         uuid: UUID,
    //         <characteristic-property>: {callback: Function, parser: Parser},
    //     },
    // }
    // where:
    // <characteristic-class> is one of:
    // - 'measurement' for the data transmitting characteristic as in Cycling Power
    // measurement, Heart Rate measurement, etc.
    // - 'control' for the control point characteristic if one exists
    // - 'response' for a response characteristic if one exists
    // - 'status' for a status characteristic if one exists
    //
    // <characteristic-property> is one of:
    // - 'notify' for the NOTIFY property of a characteristic
    //
    // - callback is the function that will return the message decoded
    // - parser is an object with decode or encode method that can handle the
    // parsing of the dataview received from a characteristic,
    // note that the parsed message will be availble in the configured callback
    //
    // Example with FTMS:
    // const spec = {
    //     measurement: {
    //         uuid: uuids.indoorBikeData,
    //         notify: {callback: onData, parser: indoorBikeDataParser},
    //     },
    //     control: {
    //         uuid: uuids.fitnessMachineControlPoint,
    //         notify: {callback: onControl, parser: controlResponseParser},
    //     },
    //     status: {
    //         uuid: uuids.fitnessMachineStatus,
    //         notify: {callback: onStatus, parser: statusParser},
    //     },
    // };
    //
    const spec = args.spec ?? {};

    // protocol is the configurable function where the specific steps for each
    // characteristcs initialization will be executed. For example FTMS needs
    // to receive unlock message before it will start transmitting and responding
    // this is the place to add service specific init code.
    //
    // Void -> Bool
    const protocol = args.protocol ?? defaultProtocol;

    // Most measurement-only services need no handshake after notifications start.
    async function defaultProtocol() {
        return true;
    }

    // Keep decoded messages visible in the console when no application callback was supplied.
    function defaultCallback(msg) {
        console.log(`ble: ${getName()} on-data: `, msg);
    }

    // if a parser is not configured in the spec object the default one will used
    // decode(), method will decode the received messages to:
    // {raw: [Int]}, where the raw contains the the raw message, this is useful for
    // debuging and when developing a new device
    // encode(), method will log back the device name and data, but it won't write
    // to the characteristic
    const defaultParser = {
        decode: (dataview) => {
            const msg = {raw: dataviewToArray(dataview)};
            print.log(`rx: ${getName()} msg: `, msg);
            return msg;
        },
        encode: (data = {}) => {
            print.log(`tx: ${getName()} msg: `, data);
        }
    };
    // end config

    //
    // state
    //
    // public state

    // {'<characteristic-name>': Characteristic}
    let characteristics = {};
    // end public state

    // private state

    // [BluetoothRemoteGATTCharacteristic {
    //     service: BluetoothRemoteGATTService,
    //     uuid: String,
    //     properties: BluetoothCharacteristicProperties,
    //     oncharacteristicvaluechanged: null,
    //     value: null,
    // ]
    let _gattCharacteristics;

    // {'<characteristic-uuid>': BluetoothRemoteGATTCharacteristic}
    let _characteristics;

    // Bool
    let _started = false;

    // end private state
    // end state

    // accessors

    // Void -> String
    function getName() {
        return _name;
    }

    // Void -> String
    function isStarted() {
        return _started;
    }
    // end accessors

    // Discover the service's values once and index them by UUID for the configured spec.
    async function getCharacteristics() {
        _gattCharacteristics = await _service.getCharacteristics();
        _characteristics = gattListToObject(_gattCharacteristics);
    }

    // Wrap each configured value and connect its decoder to its update callback.
    //
    // Void -> Bool
    async function start() {
        for(const key in spec) {
            characteristics[key] = Characteristic({
                characteristic: _characteristics[spec[key].uuid]
            });

            if(exists(spec[key].notify)) {
                await characteristics[key].startNotificationsWithRetry(
                    compose2(
                        spec[key].notify?.callback ?? defaultCallback,
                        spec[key].notify?.parser?.decode ?? defaultParser,
                    ),
                );
            }
        }

        _started = true;
        return true;
    }

    // Stop each configured stream of updates before marking the service inactive.
    //
    // Void -> Bool
    async function stop() {
        print.log(`:ble :tx :service ${_name} :stoping`);
        for(const key in spec) {
            await characteristics[key]?.stopNotifications();
        }
        _started = false;
        print.log(`:ble :tx :service ${_name} :stoped`);
    }

    // execute all steps needed to init the service
    // - get characteristics
    // - start notifications
    // - do any service specific work in the protocol method
    //
    // Void -> Bool
    async function setup() {
        try {
            let resChars = await getCharacteristics();
            let resStart = await start();
            let resProtocol = await protocol();
            return resStart && resProtocol;
        } catch(e) {
            console.warn(`ble: error: service: setup: `, e);
            return false;
        }
    }

    return {
        start,
        stop,
        isStarted,
        getCharacteristics,
        setup,
        characteristics,
    };
}

// think of the following as static methods

// Produce a readable diagnostic label for a browser service, with an unknown-name fallback.
function serviceToString(service) {
    for(let name in uuids) {
        if(uuids[name] === service.uuid) {
            return `uuid: ${service.uuid} primary-service: ${name} `;
        }
    }

    return `uuid: ${service.uuid} primary-service: unknown`;
}

// Index discovered services or characteristics by UUID; a later duplicate replaces an earlier one.
function gattListToObject(xs) {
    return xs.reduce((acc, x) => {
        acc[x.uuid] = x;
        return acc;
    }, {});
}

export {
    Service,
    serviceToString,
    gattListToObject,
};

