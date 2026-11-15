/*
 * Incomplete reader for encrypted Race Controller button messages. Encryption
 * hides the raw contents until a matching key can decode them. The intended
 * result identifies idle/button messages and plus/minus presses, but the current
 * decryption and operation-code handling are unfinished.
 */

//
// Race Controller Measurement Characteristic
//

// Accept an external crypto helper; the fallback returns empty text, not decoded button data.
function RaceControllerMeasurement(args = {}) {
    const architecture = true;

    const opCodes = {
        buttons: 7,
        idle: 21,
        unknown: 0xFF,
    };

    const crypto = args.crypto ?? { decrypt: (x) => '' };

    // Unfinished handoff: this currently references decrypt.buffer rather than the incoming view.
    function decrypt(dataview) {
        return crypto.decrypt(decrypt.buffer);
    }

    // NOTE:
    // normal button: not pressed 1, pressed 0
    // numeric button: not pressed 0, pressed: Int > 0

    // Inspect the tentative decoded text; unrecognized content returns {type: 'unknown'}.
    function decode(dataview) {
        const str = decrypt(dataview) ?? '0xFF';
        const opCode = str.substring(0, 1);

        let type = 'unknown';
        let data = {};

        if(opCode === opCodes.buttons) {
            type = 'buttons';
            data.plus = (str.substring(4, 6) === '00');
            data.minus = (str.substring(8, 10) === '00');
        }

        if(opCode === opCodes.idle) {
            type = 'idle';
        }

        // TODO: handle other message types

        return {
            type,
            ...data,
        };
    }

    return Object.freeze({
        decrypt,
        decode,
    });
}

export {
    RaceControllerMeasurement,
};

