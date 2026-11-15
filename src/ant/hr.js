/*
 * Translates ANT+ heart-rate pages between eight-byte messages and named values.
 * A byte is one small storage unit. Every page shares the latest heart rate and
 * beat counter; the first byte identifies any extra information, such as battery
 * or manufacturer details. Some optional pages below are still placeholders.
 */

import { equals, existance, curry2, setUint24LE, getUint24LE,
         xor, nthBit, nthBitToBool } from '../functions.js';
import { ids, channelTypes, keys, } from './constants.js';
import { format } from '../utils.js';
import { DataPage } from './common.js';

/**
 * Build the shared heart-rate layout and let page-specific callbacks fill/read
 * bytes 1–3. Encoding takes beat time in seconds and rate in beats/minute.
 * Decoding currently returns beat time as raw 1/1024-second ticks, not seconds.
 */
function HRDataPage(spec = {}) {
    const defaults = {
        number: 0,
        pageChange: 0,
    };

    // Pages without extra fields leave the common bytes alone and add no decoded values.
    function defaultEncode(args) { return args.view; }
    function defaultDecode(args) { return {}; }

    const number     = existance(spec.number, 0);
    const specEncode = existance(spec.encode, defaultEncode);
    const specDecode = existance(spec.decode, defaultDecode);

    const definitions = Object.assign({
        heartBeatEventTime: {
            resolution: 1/1024, unit: 's', min: 0, max: 63.999, default: 0,
        },
        heartBeatCount: {
            resolution: 1, unit: '', min: 0, max: 256, default: 0,
        },
        heartRate: {
            resolution: 1, unit: 'bpm', min: 1, max: 255, default: 255, invalid: 0x00,
        }
    }, existance(spec.definitions, {}));

    const data   = DataPage({definitions});
    const length = data.length;

    // Put the page-change flag in the top bit, then fill the common and page-specific fields.
    function encode(args = {}) {
        const pageChange         = existance(args.pageChange, defaults.pageChange);
        const heartBeatEventTime = data.encodeField(
            'heartBeatEventTime', args.heartBeatEventTime
        );
        const heartBeatCount = data.encodeField('heartBeatCount', args.heartBeatCount);
        const heartRate      = data.encodeField('heartRate',      args.heartRate);

        const combined = (pageChange << 7) + number;

        const buffer = new ArrayBuffer(length);
        const view   = new DataView(buffer);
        view.setUint8( 0, combined, true);
        view.setUint16(4, heartBeatEventTime, true);
        view.setUint8( 6, heartBeatCount, true);
        view.setUint8( 7, heartRate, true);

        return specEncode({view, data, ...args});
    }

    // Separate the page number from its change flag and merge in any optional page fields.
    function decode(dataview) {
        const combined   = dataview.getUint8(0, true);
        const dataPage   = combined & 0b01111111;
        const pageChange = combined >> 7;


        const heartBeatEventTime = dataview.getUint16(4, true);
        const heartBeatCount     = dataview.getUint8(6, true);
        const heartRate          = dataview.getUint8(7, true);

        return {
            dataPage,
            pageChange,
            heartBeatEventTime,
            heartBeatCount,
            heartRate,
            ...specDecode({data, dataview}),
        };
    }

    return Object.freeze({
        number,
        length,
        definitions,
        encode,
        decode,
    });
}

// Heart-rate-only page: fill the unused three bytes with the protocol's reserved value.
function DataPage0() {
    // Data Page 0 (0x00) – Default Data Page
    const number = 0;

    function encode(args = {}) {
        args.view.setUint8(1, 0xFF, true);
        args.view.setUint8(2, 0xFF, true);
        args.view.setUint8(3, 0xFF, true);
        return args.view;
    }

    function decode(args) {
        return {};
    }

    return HRDataPage({number, encode, decode});
}

// Add the sensor's total operating time, converted between seconds and two-second steps.
function DataPage1() {
    // Data Page 1 (0x01) – Cumulative Operating Time
    const number = 1;

    const definitions = {
        cumulativeOperatingTime: {
            resolution: 2, unit: 's', min: 0, max: 33554430, default: 0,
        }
    };

    function encode(args = {}) {
        const cumulativeOperatingTime = args.data.encodeField(
            'cumulativeOperatingTime', args.cumulativeOperatingTime,
        );
        setUint24LE(args.view, 1, cumulativeOperatingTime);
        return args.view;
    }

    function decode(args) {
        const cumulativeOperatingTime = args.data.decodeField(
            'cumulativeOperatingTime', getUint24LE(args.dataview, 1),
        );
        return { cumulativeOperatingTime, };
    }

    return HRDataPage({number, definitions, encode, decode});
}

// Add the manufacturer ID and the upper part of the sensor's serial number.
function DataPage2() {
    // Data Page 2 (0x02) – Manufacturer Information
    const number = 2;
    const developerId = 255;

    // serialNumber is just the upper 16 bits of the full 4 byte value,
    // needs to be used with the manufacturerId
    // ...
    // deviceId must never be 0, don't use multiples of 65536

    function encode(args = {}) {
        const manufacturerId = existance(args.manufacturerId, developerId);
        const serialNumber   = existance(args.serialNumber);

        args.view.setUint8( 1, manufacturerId, true);
        args.view.setUint16(2, serialNumber, true);

        return args.view;
    }

    function decode(args) {
        const manufacturerId = args.dataview.getUint8( 1, true);
        const serialNumber   = args.dataview.getUint16(2, true);

        return { manufacturerId, serialNumber, };
    }

    return HRDataPage({number, encode, decode});
}

// Add the hardware/software versions and model number as three one-byte identifiers.
function DataPage3() {
    // Data Page 3 (0x03) – Product Information
    const number = 3;

    function encode(args = {}) {
        const hardwareVersion = existance(args.hardwareVersion);
        const softwareVersion = existance(args.softwareVersion);
        const modelNumber     = existance(args.modelNumber);

        args.view.setUint8(1, hardwareVersion, true);
        args.view.setUint8(2, softwareVersion, true);
        args.view.setUint8(3, modelNumber,     true);

        return args.view;
    }

    function decode(args) {
        const hardwareVersion = args.dataview.getUint8(1, true);
        const softwareVersion = args.dataview.getUint8(2, true);
        const modelNumber     = args.dataview.getUint8(3, true);

        return {
            hardwareVersion,
            softwareVersion,
            modelNumber,
        };
    }

    return HRDataPage({number, encode, decode});
}

// Placeholder: only the shared heart-rate fields work; the previous-beat detail is not handled yet.
function DataPage4() {
    // Data Page 4 (0x04) – Previous Heart Beat Event Time for R-R Interval
    const number = 4;

    function encode(args = {}) {
        // ...
        return args.view;
    }

    function decode(args) {
        // ...
        return {};
    }

    return HRDataPage({number, encode, decode});
}

// Placeholder: swim-summary fields are not handled; common heart-rate fields still pass through.
function DataPage5() {
    // Data Page 5 (0x05) – Swim Interval Summary
    const number = 5;

    function encode(args = {}) {
        // ...
        return args.view;
    }

    function decode(args) {
        // ...
        return {};
    }

    return HRDataPage({number, encode, decode});
}

// Placeholder for supported-feature flags; only common heart-rate fields are currently handled.
function DataPage6() {
    // Data Page 6 (0x06) – Capabilities
    const number = 6;

    function encode(args = {}) {
        // ...
        return args.view;
    }

    function decode(args) {
        // ...
        return {};
    }

    return HRDataPage({number, encode, decode});
}

// Placeholder for battery details; only common heart-rate fields are currently handled.
function DataPage7() {
    // Data Page 7 (0x07) – Battery Status
    const number = 7;

    function encode(args = {}) {
        // ...
        return args.view;
    }

    function decode(args) {
        // ...
        return {};
    }

    return HRDataPage({number, encode, decode});
}

// Unimplemented mode-setting page; it is not registered in HR's supported pages.
function DataPage76() {
    // Data Page 76(0x46) – Mode Settings Command
}

// Collect the known heart-rate pages into a decoder usable by the ANT device handler.
function HR() {
    // Heart Rate Profile
    const pages = {
        dataPage0: DataPage0(),
        dataPage1: DataPage1(),
        dataPage2: DataPage2(),
        dataPage3: DataPage3(),
        dataPage4: DataPage4(),
        dataPage5: DataPage5(),
        dataPage6: DataPage6(),
        dataPage7: DataPage7(),
    };

    // Unexposed receiver preset; zero address values mean search for any matching sensor.
    function slave(args = {}) {
        const defaults = {
            transmissionType: 0, // for searching
            deviceNumber:     0, // for searching
        };

        const transmissionType = existance(
            args.transmissionType, defaults.transmissionType
        );
        const deviceNumber = existance(args.deviceNumber, defaults.deviceNumber);

        return {
            channelType: channelTypes.slave,
            networkKey: keys.antPlus,
            rfFrequency: 57,
            deviceType: 120,
            channelPeriod: 8070,
            searchTimeout: 30,
            transmissionType,
            deviceNumber,
        };
    };

    // Ignore the changing high bit when choosing a page; preserve unknown pages unchanged.
    function decode(dataview) {
        const dataPage = dataview.getUint8(0, true) & 0b01111111;
        if(equals(dataPage, 0)) return pages.dataPage0.decode(dataview);
        if(equals(dataPage, 1)) return pages.dataPage1.decode(dataview);
        if(equals(dataPage, 2)) return pages.dataPage2.decode(dataview);
        if(equals(dataPage, 3)) return pages.dataPage3.decode(dataview);
        if(equals(dataPage, 4)) return pages.dataPage4.decode(dataview);
        if(equals(dataPage, 5)) return pages.dataPage5.decode(dataview);
        if(equals(dataPage, 6)) return pages.dataPage6.decode(dataview);
        if(equals(dataPage, 7)) return pages.dataPage7.decode(dataview);
        return dataview;
    }

    return {
        ...pages,
        decode,
    };
}

const hr = HR();

export { hr, HRDataPage };

