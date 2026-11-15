/*
 * A FIT field definition describes one later value in three bytes: field number,
 * value size in bytes and storage-type code. It contains no measurement itself.
 * The profile dictionary translates storage names such as uint16 into the
 * numeric code saved in the file.
 */

import { profiles } from './profiles/profiles.js';

// Position helpers locate the three entries relative to a caller-supplied byte offset.
function FieldDefinition(args = {}) {
    const architecture = args.architecture ?? true;

    const length        = 3;
    const numberIndex   = (offset = 0) => offset+0;
    const sizeIndex     = (offset = 0) => offset+1;
    const baseTypeIndex = (offset = 0) => offset+2;

    // {number: Int, size: Int, base_type: BaseType}
    // DataView,
    // Int,
    // -> DataView
    // Write the descriptor into an existing view; size may cover several values of the same type.
    function encode(definition, view, i = 0) {
        const base_type_number = profiles.BaseType[definition.base_type];
        view.setUint8(numberIndex(i),   definition.number, architecture);
        view.setUint8(sizeIndex(i),     definition.size,   architecture);
        view.setUint8(baseTypeIndex(i), base_type_number,  architecture);
        return view;
    }

    // String
    // DataView,
    // Int,
    // ->
    // {number: Int, size: Int, base_type: BaseType}
    // Read the raw descriptor and translate its type code; message-specific field naming happens later.
    function decode(messageName, view, i = 0) {
        const number           = view.getUint8(numberIndex(i),   architecture);
        const size             = view.getUint8(sizeIndex(i),     architecture);
        const base_type_number = view.getUint8(baseTypeIndex(i), architecture);
        const base_type        = profiles.BaseType[(base_type_number).toString()];

        return { number, size, base_type };
    }

    return Object.freeze({
        length,
        numberIndex,
        sizeIndex,
        baseTypeIndex,
        encode,
        decode,
    });
}

const fieldDefinition = FieldDefinition();

export {
    fieldDefinition,
};

