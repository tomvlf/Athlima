/*
 * Basic FIT value conversions: numbers, text and timestamps. FIT stores data in
 * bytes (small numeric storage units); a DataView reads/writes numbers across
 * those bytes. "Architecture" selects byte order: true means the smallest-value
 * byte comes first. Measurement scales and offsets come from the FIT profile.
 */

import { equals, } from '../functions.js';

const HeaderType = {
    normal:    'normal',
    timestamp: 'timestamp',
};

const RecordType = {
    header:     'header',
    definition: 'definition',
    data:       'data',
    crc:        'crc',
};

// Base Type To DataView accessor method
const uint8   = [0, 2, 7, 10, 13, 'enum', 'uint8', 'string', 'byte'];
const uint16  = [132, 139, 'uint16', 'uint16z'];
const uint32  = [134, 140, 'uint32', 'uint32z'];
const uint64  = [143, 144, 'uint64', 'uint64z'];

const int8    = [1, 'sint8'];
const int16   = [131, 'sint16'];
const int32   = [133, 'sint32'];
const int64   = [142, 'sint64'];

const float32 = [136, 'float32'];
const float64 = [137, 'float64'];

// Choose the DataView reader/writer name from a FIT storage type; unknown types fall back to one byte.
function typeToAccessor(basetype, method = 'set') {
    if(uint8.includes(basetype))   return `${method}Uint8`;
    if(uint16.includes(basetype))  return `${method}Uint16`;
    if(uint32.includes(basetype))  return `${method}Uint32`;
    if(uint64.includes(basetype))  return `${method}Uint64`;
    if(int8.includes(basetype))    return `${method}Int8`;
    if(int16.includes(basetype))   return `${method}Int16`;
    if(int32.includes(basetype))   return `${method}Int32`;
    if(int64.includes(basetype))   return `${method}Int64`;
    if(float32.includes(basetype)) return `${method}Float32`;
    if(float64.includes(basetype)) return `${method}Float64`;

    return `${method}Uint8`;
}
// END Base Type To DataView accessor method

// Read at byte position i using either a FIT type or an explicit DataView type name.
function getView(type, dataview, i = 0, architecture = true, useBaseType = true) {
    if(useBaseType) {
        return dataview[typeToAccessor(type, 'get')](i, architecture);
    }
    try {
        return dataview[`get${type}`](i, architecture);
    } catch(e) {
        console.error(`:fit :getView ${type} at ${i}`, e);
    }
}

// Read exactly size character bytes and remove zero-byte padding; this is not a UTF-8 decoder.
function getStringView(size, dataview, i = 0, architecture = true) {
    let value = '';
    for(let f=0; f < size; f++) {
        value += String.fromCharCode(dataview.getUint8(i+f, architecture));
    }
    return value.replace(/\x00/gi, '');
}

// Write a number into the supplied view at byte i; the underlying setter supplies the return value.
function setView(
    type, value, dataview, i = 0, architecture = true, useBaseType = true
) {
    if(useBaseType) {
        return dataview[typeToAccessor(type, 'set')](i, value, architecture);
    }
    return dataview[`set${type}`](i, value, architecture);
}

// Bundle optional encode/decode transforms; missing transforms simply return their input unchanged.
function ValueParser(args = {}) {
    return Object.freeze({
        encode: args.encode ?? ((x) => x),
        decode: args.decode ?? ((x) => x),
    });
}

const identityParser = ValueParser();

// Decode fixed-width text for numeric FIT type 7; string encoding is still an empty placeholder.
function FitString() {

    // BaseType -> Bool
    function isString(base_type) {
        return equals(base_type, 7);
    }

    function encode() {
    }

    // {size: Int}, DataView, Int, Bool, -> String
    function decode(field, dataview, i = 0, architecture) {
        return getStringView(field.size, dataview, i, architecture);
    }

    return Object.freeze({
        isString,
        encode,
        decode,
    });
}

/**
 * Translate JavaScript timestamps (milliseconds since 1970) to FIT timestamps
 * (seconds since 31 December 1989). Recognition includes date_time and
 * local_date_time; the same arithmetic is used for both.
 */
function FitTimestamp() {
    const garmin_epoch = Date.parse('31 Dec 1989 00:00:00 GMT');

    // FitSemanticType -> Bool
    function isTimestamp(type) {
        return ['date_time', 'local_date_time'].includes(type);
    }

    // Shift the starting date and round to a whole FIT second.
    function apply(jsTimestamp) {
        return Math.round((jsTimestamp - garmin_epoch) / 1000);
    }

    // Restore the JavaScript millisecond timestamp.
    function remove(fitTimestamp) {
        return (fitTimestamp * 1000) + garmin_epoch;
    }

    // Return elapsed seconds between two JavaScript timestamps, using FIT's whole-second rounding.
    function elapsed(start, end) {
        return (apply(end) - apply(start));
    }

    // Convert milliseconds to FIT seconds, then write using the field's storage width.
    function encode(field, value, view, i, architecture) {
        return setView(field.base_type, apply(value), view, i, architecture);
    }

    // Read the stored time and return milliseconds suitable for new Date(...).
    function decode(field, view, i, architecture) {
        return remove(getView(field.base_type, view, i, architecture));
    }

    return Object.freeze({
        isTimestamp,
        apply,
        remove,
        elapsed,
        encode,
        decode,
    });
}

// Scale ordinary numeric fields while preserving an explicitly supplied "invalid/missing" marker.
function FitNumber() {
    // Reserved type-detection entry point; callers must not rely on it because it throws.
    function isNumber() {
        throw `Not implemented!`;
    }

    // Store (measurement + offset) × scale; absent measurements become zero.
    function apply(scale, offset, value, invalid) {
        if(invalid !== undefined && value === invalid) return value;
        return ((value ?? 0) * (scale ?? 1)) + ((offset ?? 0) * (scale ?? 1));
    }

    // Reverse scaling into the measurement's unit, leaving the missing-data marker untouched.
    function remove(scale, offset, value, invalid) {
        if(invalid !== undefined && value === invalid) return value;
        return ((value ?? 0) - ((offset ?? 0) * (scale ?? 1))) / (scale ?? 1);
    }

    // {base_type: BaseType, scale: Int, offset: Int}, Number, DataView, Int, Bool,
    // ->
    // DataView
    // Apply the field rules and mutate the caller's byte buffer at position i.
    function encode(field, value, view, i = 0, architecture = true) {
        return setView(
            field.base_type,
            apply(field.scale, field.offset, value, field.invalid),
            view, i, architecture
        );
    }

    // {base_type: BaseType, scale: Int, offset: Int}, DataView, Int, Bool,
    // ->
    // Number
    // Read the stored number and undo its field-specific scale and offset.
    function decode(field, view, i = 0, architecture = true) {
        return remove(
            field.scale,
            field.offset,
            getView(field.base_type, view, i, architecture),
            field.invalid
        );
    }

    return Object.freeze({
        isNumber,
        apply,
        remove,
        encode,
        decode,
    });
}

const type = {
    string: FitString(),
    timestamp: FitTimestamp(),
    number: FitNumber(),
};

export {
    HeaderType,
    RecordType,

    typeToAccessor,
    getView,
    setView,

    ValueParser,
    identityParser,

    type,
};

