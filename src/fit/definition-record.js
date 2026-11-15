/*
 * FIT definition records describe the layout of following data records: message
 * identity, byte order, and each field's number, width and storage type. This
 * saves repeating field names with every sample. Developer fields are optional
 * extensions added by a device/app; their widths also count toward record length.
 */

import { nth, isArray, } from '../functions.js';

import {
    HeaderType, RecordType,
    ValueParser, identityParser,
} from './common.js';
import { profiles } from './profiles/profiles.js';
import { recordHeader } from './record-header.js';
import { fieldDefinition } from './field-definition.js';

// Convert layout descriptions between byte buffers and FITjs objects; name lookups delegate to profiles.
function DefinitionRecord(args = {}) {
    const _type               = RecordType.definition;
    const headerSize          = recordHeader.size;
    const fixedContentLength  = 6;
    const fieldLength         = 3;
    const architecture        = (args.architecture ?? true) ? 0 : 1;
    const numberOfFieldsIndex = 5;

    function numberToMessageName(number) {
        return profiles.numberToMessageName(number);
    }

    function messageNameToNumber(messageName) {
        return profiles.messageNameToNumber(messageName);
    }

    // Count the fixed header and three-byte descriptors, including the optional developer-field section.
    function getDefinitionRecordLength(view, start = 0) {
        const numberOfFields    = readNumberOfFields(view, start);
        const numberOfDevFields = readNumberOfDevFields(view, start);

        return fixedContentLength +
            (numberOfFields * fieldLength) +
            (numberOfDevFields > 0 ? 1 : 0) +
            (numberOfDevFields * fieldLength);
    }

    // A data record needs one header byte plus all declared value widths, including array slots.
    function getDataRecordLength(fields) {
        return headerSize + fields.reduce((acc, x) => acc + x.size, 0);
    }

    // Ordinary-field count lives at a fixed position in the definition header.
    function readNumberOfFields(view, start = 0) {
        return view.getUint8(start + numberOfFieldsIndex, true);
    }

    // Read the extra count only when the developer flag is set, after all ordinary descriptors.
    function readNumberOfDevFields(view, start = 0) {
        const header = recordHeader.decode(view.getUint8(start, true));
        if(recordHeader.isDeveloper(header)) {
            const numberOfFields = readNumberOfFields(view, start);
            const index = start + fixedContentLength + (numberOfFields * fieldLength);

            return view.getUint8(index, true);
        }
        return 0;
    }

    // {
    //     type: RecordType,
    //     name: String,
    //     local_number: Int,
    //     architecture: Int,
    //     length: Int,
    //     data_record_length: Int,
    //     fields: [{number: Int, size: Int, base_type: BaseType}]
    //     dev_fields?: [{number: Int, size: Int, base_type: BaseType}]?
    // }
    // -> DataView
    // Write the layout into the supplied view, adding developer descriptors when supplied.
    function encode(definition, view, i = 0) {
        const hasDeveloperFields = (definition.dev_fields?.length ?? 0) > 0;
        const header = recordHeader.encode({
            messageType:      _type,
            localMessageType: definition.local_number,
            messageTypeSpecific: hasDeveloperFields ? 'developer' : 'reserved',
        });
        const numberOfFields = definition.fields.length;
        const globalNumber   = messageNameToNumber(definition.name);

        const length = fixedContentLength + (numberOfFields * fieldLength);

        view.setUint8( i+0, header,         true);
        view.setUint8( i+1, 0,              true);
        view.setUint8( i+2, architecture,   true);
        view.setUint16(i+3, globalNumber,   true);
        view.setUint8( i+5, numberOfFields, true);

        i += fixedContentLength;
        definition.fields.forEach((field) => {
            fieldDefinition.encode(field, view, i);
            i += fieldLength;
        });

        if(hasDeveloperFields) {

            const numberOfDeveloperFields = definition.dev_fields.length;

            view.setUint8(i, numberOfDeveloperFields, true);
            i += 1;

            definition.dev_fields.forEach((field) => {
                fieldDefinition.encode(field, view, i);
                i += fieldLength;
            });
        }

        return view;
    }

    // DataView,
    // Int
    // ->
    // {
    //     type: RecordType
    //     name: String,
    //     architecture: Int,
    //     local_number: Int,
    //     length: Int,
    //     data_record_length: Int,
    //     fields:      [{number: Int, size: Int, base_type: BaseTypes}],
    //     dev_fields?: [{number: Int, size: Int, base_type: BaseTypes}]?
    // }
    // Respect the file's declared byte order and calculate how far the next data record must advance.
    function decode(view, start = 0) {
        const header            = recordHeader.decode(view.getUint8(start, true));
        const local_number      = header.localMessageType;
        const architecture      = view.getUint8(start+2, true);
        const littleEndian      = !architecture;
        const messageNumber     = view.getUint16(start+3, littleEndian);
        const messageName       = numberToMessageName(messageNumber);
        const numberOfFields    = readNumberOfFields(view, start);
        const numberOfDevFields = readNumberOfDevFields(view, start);

        // i  is the dataview index
        // f  is the current field index
        // df is the current developer field index
        let i = start + fixedContentLength;
        let fields = [];

        for(let f=0; f < numberOfFields; f++) {
            fields.push(fieldDefinition.decode(messageName, view, i,));
            i += fieldLength;
        }

        i+=1; // add the 'number of dev fields' field

        let dev_fields = [];
        for(let df=0; df < numberOfDevFields; df++) {
            dev_fields.push(fieldDefinition.decode(messageName, view, i,));
            i += fieldLength;
        }

        const length             = getDefinitionRecordLength(view, start);
        const data_record_length = getDataRecordLength(fields.concat(dev_fields));

        return {
            type: _type,
            architecture,
            name: messageName,
            local_number,
            length,
            data_record_length,
            fields,
            dev_fields,
        };
    }

    // ['message_name', ['field_name'], Int] |
    // ['message_name', [['field_name', Int]], Int]
    // ->
    // {
    //     type: RecordType
    //     architecture: Int,
    //     name: String,
    //     local_number: Int,
    //     length: Int,
    //     data_record_length: Int,
    //     fields: [{number: Int, size: Int, base_type: base_type}]
    // }
    // Expand [message, fields, local number] from the app's export list.
    // A [field name, size] entry overrides the usual width for arrays or fixed-size text.
    function toFITjs(productMessageDefinition = ['', []]) {
        const messageName    = nth(0, productMessageDefinition);
        const fields         = nth(1, productMessageDefinition);
        // const fieldNames     = fields;
        const local_number   = nth(2, productMessageDefinition);
        const numberOfFields = fields.length;
        const length         = fixedContentLength + (numberOfFields * fieldLength);

        return fields.reduce(function(acc, field) {
            const name      = isArray(field) ? field[0] : field;
            const number    = profiles.fieldNameToNumber(messageName, name);
            const size      = isArray(field) ? field[1] : profiles.fieldNameToSize(name);
            const base_type = profiles.fieldNameToBaseType(name);

            acc.data_record_length += size;
            acc.fields.push({number, size, base_type});

            return acc;
        }, {
            type: _type,
            architecture,
            name: messageName,
            local_number,
            length,
            data_record_length: 1,
            fields: [],
            dev_fields: [],
        });
    }

    return Object.freeze({
        getDefinitionRecordLength,
        getDataRecordLength,
        encode,
        decode,
        toFITjs,
    });
}

const definitionRecord = DefinitionRecord();

export {
    DefinitionRecord,
    definitionRecord,
};
