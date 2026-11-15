/*
 * The one-byte label before each FIT record. Its bits (individual yes/no slots)
 * identify definition versus data records, extra developer fields and the local
 * message number used to find a layout. Compressed timestamps are recognized
 * by a flag, but their different header layout is not fully supported here.
 */

import {
    equals, isNumber, isObject, nthBit, setBit,
} from '../functions.js';

import {
    HeaderType, RecordType,
    ValueParser, identityParser,
} from './common.js';

// Encode/decode ordinary record headers; classification helpers accept either a byte or a decoded object.
function RecordHeader() {
    // NOTE: Supports only Normal Header Type
    // does not support Compressed Timestamp Header
    const size = 1;

    const headerType = ValueParser({
        encode: (type) => equals(type, HeaderType.normal) ? 0 : 1,
        decode: (code) => equals(code, 0) ? HeaderType.normal : HeaderType.timestamp,
    });

    const messageType = ValueParser({
        encode: (type) => equals(type, RecordType.definition) ? 1 : 0,
        decode: (code) => equals(code, 1) ? RecordType.definition : RecordType.data,
    });

    const messageTypeSpecific = ValueParser({
        encode: (byte) => 0,
        decode: (byte) => (
            equals(nthBit(byte, 6), 1) && equals(nthBit(byte, 5), 1)) ?
            'developer' :
            'reserved',
    });

    const bits = {
        // 0 normal header, 1 Compressed Timestamp Header
        'headerType':          {size: 1, default: 0, present: ((_) => true), parser: headerType},
        // 0 data message, 1 definition message
        'messageType':         {size: 1, default: 0, present: ((_) => true), parser: messageType},
        // if definition message and set to 1 the message contains extended definitions for developer data
        'messageTypeSpecific': {size: 1, default: 0, present: ((_) => true), parser: identityParser},
        'reserved':            {size: 1, default: 0, present: ((_) => true), parser: identityParser},
        // local message type/number
        'localMessageType':    {size: 4, default: 0, present: ((_) => true), parser: identityParser},
    };

    const order = [
        'headerType',
        'messageType',
        'messageTypeSpecific',
        'reserved',
        'localMessageType',
    ];

    // {headerType: String, messageType: String, messageTypeSpecific: String, localMessageType: Int}
    // ->
    // Int,
    // Combine the local message number with the selected record-type and developer-data flags.
    function encode(definition) {
        let byte = 0b00000000 + (definition.localMessageType ?? 0);
        if(equals(definition.headerType, HeaderType.timestamp)) {
            byte = setBit(7, byte);
        };
        if(equals(definition.messageType, RecordType.definition)) {
            byte = setBit(6, byte);
        }
        if(equals(definition.messageTypeSpecific, 'developer')) {
            byte = setBit(5, byte);
        }
        return byte;
    }

    // Int,
    // ->
    // {headerType: String, messageType: String, messageTypeSpecific: String, localMessageType: Int}
    // Split one byte into named flags and its four-bit local number.
    function decode(byte) {
        return {
            headerType:          headerType.decode(nthBit(byte, 7)),
            messageType:         messageType.decode(nthBit(byte, 6)),
            messageTypeSpecific: messageTypeSpecific.decode(byte),
            localMessageType:    byte & 0b00001111,
        };
    }

    // A definition announces the layout of later values; a data record contains those values.
    function isDefinition(header) {
        if(isNumber(header)) return equals(nthBit(header, 6), 1) ? true : false;
        if(isObject(header)) return equals(header.messageType, RecordType.definition) ? true : false;
        return false;
    }

    function isData(header) {
        if(isNumber(header)) return equals(nthBit(header, 6), 0) ? true : false;
        if(isObject(header)) return equals(header.messageType, RecordType.data) ? true : false;
        return false;
    }

    // Extra developer fields are meaningful only on definition records, not ordinary data headers.
    function isDeveloper(header) {
        if(isNumber(header)) return (
            isDefinition(header) &&
            equals(nthBit(header, 5), 1)
        ) ? true : false;
        if(isObject(header)) return (
            equals(header.messageTypeSpecific, 'developer') &&
            equals(header.messageType, RecordType.definition)
        ) ? true : false;

        return false;
    }

    return Object.freeze({
        size,
        isDefinition,
        isData,
        isDeveloper,
        encode,
        decode,
    });
}

const recordHeader = RecordHeader();

export {
    RecordHeader,
    recordHeader,
};
