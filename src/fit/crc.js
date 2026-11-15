/*
 * FIT checksum helpers. A CRC is a small number calculated from file bytes;
 * comparing it with the saved number can reveal accidental corruption, not prove
 * who created a file. FIT uses two-byte CRC values for the optional header check
 * and the end-of-file check. Reading a stored CRC does not itself validate it.
 */

import { equals, isDataView, } from '../functions.js';
import { RecordType } from './common.js';

// Create two-byte CRC readers/writers; the default byte order stores the low byte first.
function CRCFactory(args = {}) {
    const _type = RecordType.crc;

    const size = 2;
    const architecture = args.architecture ?? true;

    // Unused compatibility helper choosing indexed-array or DataView byte access.
    function toGetter(file) {
        if(isDataView(file)) {
            return function(file, i) {
                return file.getUint8(i, true);
            };
        }
        return function(file, i) {
            return file[i];
        };
    }

    // Calculate over the inclusive byte range start...end, processing each byte in two four-bit pieces.
    function calculateCRC(file, start, end) {
        const crcTable = [
            0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
            0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
        ];

        let crc = 0;
        for (let i = start; i <= end; i++) {
            const byte = file.getUint8(i, true);
            let tmp = crcTable[crc & 0xF];
            crc = (crc >> 4) & 0x0FFF;
            crc = crc ^ tmp ^ crcTable[byte & 0xF];
            tmp = crcTable[crc & 0xF];
            crc = (crc >> 4) & 0x0FFF;
            crc = crc ^ tmp ^ crcTable[(byte >> 4) & 0xF];
        }

        return crc;
    }

    // Legacy validation entry point, separate from the record decoder's stored-CRC reads.
    function isValid(view, crc) {
        // const start = fileHeader.decode(view).size; // without file header
        const start = 0;
        const end   = view.byteLangth - size;
        return equals(crc, calculateCRC(view, start, end));
    }

    // Treat the final two remaining bytes as the file CRC; this checks position, not correctness.
    function isCRC(view, i) {
        return equals(view.byteLength - i, size);
    }

    // Store an already-calculated checksum in the supplied view at byte i.
    function encode(crc, view, i = 0) {
        view.setUint16(i, crc, architecture);
        return view;
    }

    // Read the checksum as a FITjs record so the file parser can advance by two bytes.
    function decode(view, i = 0) {
        let value = view.getUint16(i, architecture);
        return {type: _type, length: size, crc: value};
    }

    // Create a checksum record placeholder; the file encoder calculates its final value after all data.
    function toFITjs(crc) {
        return {
            type: _type,
            length: size,
            crc: crc ?? undefined,
        };
    }

    // Split a checksum into low and high bytes for display or comparison.
    function toArray(crc) {
        return [crc & 0xFF, crc >> 8];
    }

    // Legacy array conversion helper; normal file reads use decode or getFileCRC instead.
    function fromArray(array) {
        return array[0] + array[1] << 8;
    }

    // Read bytes 12–13 from a 14-byte header, returning both the number and its byte pair.
    function getHeaderCRC(dataview) {
        const number = dataview.getUint16(12, true);
        const array = [
            dataview.getUint8(12, true),
            dataview.getUint8(13, true)
        ];

        return {
            number,
            array,
        };
    }

    // Read the last two file bytes, returning both the number and its byte pair without recalculation.
    function getFileCRC(dataview) {
        const byteLength = dataview.byteLength;
        const number = dataview.getUint16(byteLength - size, true);
        const array = [
            dataview.getUint8(byteLength -  size,      true),
            dataview.getUint8(byteLength - (size - 1), true)
        ];

        return {
            number,
            array,
        };
    }

    return Object.freeze({
        size,
        calculateCRC,
        isValid,
        isCRC,
        encode,
        decode,
        toFITjs,
        toArray,
        fromArray,
        getHeaderCRC,
        getFileCRC,
    });
}

const CRC = CRCFactory();

export {
    CRCFactory,
    CRC,
};

