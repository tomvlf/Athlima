/*
 * Lookup layer over the static FIT profile dictionaries. The profile describes
 * what numbered messages/fields mean and how their values are stored. Decoders
 * use it to turn numbers into readable names; encoders use it to select field
 * numbers, storage types and sizes. Unknown decoded names get stable placeholders.
 */

//
// Profiles
//
// Expose the global dictionaries; the app's export subset is selected separately.
//

import { exists, equals } from '../../functions.js';

import { BaseType, BaseTypeDefinitions, } from './base-types.js';
import global_message_definitions from './global-message-definitions.js';
import global_type_definitions from './global-type-definitions.js';
import global_field_definitions from './global-field-definitions.js';

/**
 * Bundle profile lookups. Size/type/name accessors are dictionary reads only;
 * size results are bytes. Direct name lookups expect known entries, whereas
 * number-to-name lookups supply message_N / field_N fallbacks.
 */
function Profiles(args = {}) {

    // Keep the supplied static dictionaries intact rather than modifying them for a file.
    const types = global_type_definitions;
    const messages = global_message_definitions;
    const fields = global_field_definitions;

    // methods
    // Resolve a global FIT message number while retaining unknown numbers in a readable name.
    function numberToMessageName(number) {
        return types['mesg_num'].values[(number).toString()] ?? `message_${number}`;
    }

    // Add the requested name to its field metadata, or return just the name if it is unknown.
    function Field(name) {
        return {name, ...(fields[name] ?? {})};
    }

    // Int -> Field{
    //     name: String,
    //     type: String,
    //     base_type: BaseType,
    //     units: String,
    //     scale: Int,
    //     offset: Int,
    //     bits: Int,
    //     accumulate: String
    // }
    // Field numbers are message-specific, so find the name within this message before reading its metadata.
    function numberToField(messageName, fieldNumber) {
        const message = messages[messageName];
        if(!exists(message)) {
            return Field(`field_${fieldNumber}`);
        }
        const messageFields = message.fields;
        for(let fieldName in messageFields) {
            if(equals(messageFields[fieldName], fieldNumber)) return Field(fieldName);
        }
        return Field(`field_${fieldNumber}`);
    }

    // Use FIT's invalid-number marker when an encoding request names an unknown message.
    function messageNameToNumber(name) {
        return types.mesg_num.values[name] ?? 0xFFFF;
    }

    // String -> GlobalFieldDefinition{}
    function fieldNameToField(fieldName) {
        return fields[fieldName];
    }

    function fieldNameToNumber(messageName, fieldName) {
        return messages[messageName].fields[fieldName];
    }

    function fieldNameToSize(name) {
        return BaseTypeDefinitions[fields[name].base_type].size;
    }

    function fieldNameToBaseType(name) {
        return fields[name].base_type;
    }

    function baseTypeToSize(base_type) {
        return BaseTypeDefinitions[base_type].size;
    }

    return Object.freeze({
        BaseType,
        BaseTypeDefinitions,
        types,
        messages,
        fields,

        numberToMessageName,
        messageNameToNumber,

        numberToField,
        fieldNameToField,
        fieldNameToNumber,
        fieldNameToSize,
        fieldNameToBaseType,
        baseTypeToSize,
    });
}


// Unused indexing helper: store each source item under two keys, both pointing to the same object.
function toDualKeyMap(source, first_key, second_key) {
    return source.reduce(function (acc, sourceItem) {
        acc.set(sourceItem[first_key], sourceItem);
        acc.set(sourceItem[second_key], sourceItem);
        return acc;
    }, new Map());
}

const profiles = Profiles();

export {
    Profiles,
    profiles,
};

