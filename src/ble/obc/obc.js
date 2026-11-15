/*
 * Reads Open Bike Control button messages from Bluetooth. Each packet (one
 * complete received message) starts with a message type, then pairs of bytes:
 * button ID and state. The three button-family decoders turn recognized pairs
 * into named actions; controls.js separately decides what those actions do.
 */

//
// OpenBikeControl Service
//

import { expect, equals, } from '../../functions.js';
import { uuids, } from '../web-ble.js';
import { Service } from '../service.js';
import { virtualGearShifting } from './virtual-gear-shifting.js';
import { uiControls } from './ui-controls.js';
import { trainingControls } from './training-controls.js';

const buttonStateMessageType = 0x01;

// Decode complete ID/state pairs only. Unknown message types, unknown buttons
// and an unmatched final byte are ignored rather than treated as button presses.
function decodeButtonState(dataview) {
    if(!dataview || dataview.byteLength < 1) return [];
    if(!equals(dataview.getUint8(0, true), buttonStateMessageType)) return [];

    const messages = [];

    for(let i = 1; i + 1 < dataview.byteLength; i += 2) {
        const pair = {
            id: dataview.getUint8(i, true),
            state: dataview.getUint8(i + 1, true),
        };
        const message = virtualGearShifting.decodePair(pair)
            || uiControls.decodePair(pair)
            || trainingControls.decodePair(pair);
        if(message) messages.push(message);
    }

    return messages;
}

// Subscribe to button-state updates through Service's shared setup/start/stop lifecycle.
function OBC(args = {}) {

    // config
    const onData = args.onData;

    // BluetoothRemoteGATTService{
    //     device: BluetoothDevice,
    //     uuid: String,
    //     isPrimary: Bool,
    // }
    const gattService = expect(
        args.service, 'OBC needs BluetoothRemoteGATTService!'
    );
    // end config

    // service
    const spec = {
        measurement: {
            uuid: uuids.buttonState,
            notify: {callback: onData, parser: {decode: decodeButtonState}},
        },
    };

    const service = Service({spec, service: gattService,});
    // end service

    return Object.freeze({
        ...service,
    });
}

export {
    decodeButtonState,
};

export default OBC;
