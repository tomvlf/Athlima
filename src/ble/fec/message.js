/*
 * Wraps FE-C trainer pages in the 13-byte ANT-shaped packets carried over Bluetooth.
 * A packet is one complete message: four introductory bytes, an eight-byte page
 * and a checksum used to detect corruption. Outgoing packets get a checksum;
 * incoming decoding currently reads the page without validating that checksum.
 */

import { xor, dataviewToArray } from '../../functions.js';
import messages from './messages.js';

// Create the fixed channel-5 message format used by this Bluetooth FE-C connection.
function AcknowledgedData() {
    const sync = 164;
    const length = 13;
    const id = 79;
    const channel = 5;
    const architecture = true;

    const fields = {
        sync:    {size: 1, type: 'Uint8',    default: 164,},
        length:  {size: 1, type: 'Uint8',    default: 9,},
        id:      {size: 1, type: 'Uint8',    default: 79,},
        channel: {size: 1, type: 'Uint8',    default: 5,},
        payload: {size: 8, type: 'DataPage',},
        check:   {size: 1, type: 'Uint8',},
    };

    const order = [
        'sync',
        'length',
        'id',
        'channel',
        'payload',
        'check',
    ];

    // Build framing, let the chosen page write its payload, then combine bytes into the final checksum.
    function encode(args = {}) {
        const dataPage = args.dataPage;
        const payload = args.payload;

        const buffer = new ArrayBuffer(length);
        const view = new DataView(buffer);

        view.setUint8(0, fields.sync.default, architecture);
        view.setUint8(1, fields.length.default, architecture);
        view.setUint8(2, id, architecture);
        view.setUint8(3, fields.channel.default, architecture);

        encodeDataPage(view, 4, dataPage, payload);

        const check = xor(view, 0, length);
        view.setUint8(12, check, architecture);

        return view;
    }

    // The page encoder writes into this existing view at byte i; an unknown page has no encoder call.
    function encodeDataPage(dataview, i, dataPage, payload) {
        return messages[`dataPage${dataPage}`]?.encode(dataview, i, payload);
    }

    // Locate the page inside the packet and return its decoded fields plus the page number.
    function decode(dataview) {
        return order.reduce(function(acc, fieldName) {
            const field = fields[fieldName];
            if(field.type === 'DataPage') {
                const dataPage = getView('Uint8', acc.i, dataview);
                acc.data = decodeDataPage(dataview, dataPage);
                acc.data.dataPage = dataPage;
            }
            acc.i += field.size;
            return acc;
        }, {i:0, data: {}}).data;
    }

    // Read a number at byte i, using the least-significant byte first for multi-byte types.
    function getView(type, i, dataview) {
        return dataview[`get${type}`](i, architecture);
    }

    // Dispatch the page body at byte 4; unrecognized pages contribute no decoded fields.
    function decodeDataPage(dataview, dataPage) {
        return messages[`dataPage${dataPage}`]?.decode(dataview, 4, 12) ?? {};
    }

    return Object.freeze({
        encode,
        decode,
    });
}

// Unexported diagnostic helper: format a number in base 16 with a 0x prefix.
function hex(n) {
    let h = parseInt(n).toString(16).toUpperCase();
    if(h.length === 1) {
        h = '0'+ h;
    }
    return '0x' + h;
}

const message = AcknowledgedData();

export {
    AcknowledgedData,
    message,
};

