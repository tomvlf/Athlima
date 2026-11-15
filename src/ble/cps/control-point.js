/*
 * Partial Cycling Power control-point helpers. A control point is the Bluetooth
 * value used to exchange commands. Here a one-byte request can be built, while
 * replies remain raw number arrays for inspection; full reply encoding is not
 * implemented. Nothing in this file writes to a device.
 */

import { existance, dataviewToArray }  from '../../functions.js';

const logs = true;

// Keep diagnostic output behind the module's logging switch.
function log(msg) {
    if(logs) {
        console.log(msg);
    }
}

// encode returns the single operation-code byte as an ArrayBuffer; decode reads that code.
function RequestControl() {
    const opCode = 0x00;
    const length = 1;

    function encode() {
        const buffer = new ArrayBuffer(length);
        const view   = new DataView(buffer);
        view.setUint8(0, opCode, true);

        return view.buffer;
    }

    function decode(dataview) {
        const opCode = dataview.getUint8(0);
        return { opCode };
    }

    return Object.freeze({
        opCode,
        length,
        encode,
        decode
    });
}

// Keep response bytes uninterpreted for now; encode is an intentionally empty placeholder.
function Response() {
    // Format:
    // ?

    const results = {
        '0x01': {definition: 'success',          msg: 'success'},
        '0x02': {definition: 'notSupported',     msg: 'not supported'},
        '0x03': {definition: 'invalidParameter', msg: 'invalid parameter'},
        '0x04': {definition: 'operationFail',    msg: 'operation fail'},
        '0x05': {definition: 'notPermitted',     msg: 'not permitted'},
    };

    function encode(value) {
    }

    function decode(dataview) {
        return dataviewToArray(dataview);
    }

    // Turn a decoded byte array into a comma-separated diagnostic and log it.
    function toString(decoded = {}) {
        const str = decoded.join(', ');

        log(`:rx :cps :response '${str}'`);

        return str;
    }

    return Object.freeze({
        results,
        encode,
        decode,
        toString,
    });
}

const control = {
    requestControl: RequestControl(),
    response:       Response(),
};

export { control };

