/**
 * Shared preparation that Jest runs before the test files. Supply missing text-encoding and
 * structured-copy features in the simulated browser, using Node's implementations. These
 * compatibility helpers affect tests only, not the app shipped to riders.
 */

// Jest's pretend browser window does not include Node's text encoder.
// The jsdom package asks for it the moment a test imports it.
import { TextDecoder, TextEncoder } from 'node:util';
import { serialize, deserialize } from 'node:v8';

// jsdom does not expose structuredClone; fake-indexeddb needs it to store values.
if (typeof globalThis.structuredClone === 'undefined') {
    globalThis.structuredClone = value => {
        try {
            return deserialize(serialize(value));
        } catch (error) {
            throw new DOMException(error.message, 'DataCloneError');
        }
    };
}

if (typeof globalThis.TextEncoder === 'undefined') {
    globalThis.TextEncoder = TextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined') {
    globalThis.TextDecoder = TextDecoder;
}
