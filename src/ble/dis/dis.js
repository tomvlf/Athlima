/*
 * Legacy, unfinished Device Information Service reader for manufacturer, model
 * and firmware text. It still references the older BLEService/UUID interfaces
 * and placeholder characteristic IDs, rather than the active Service factory.
 * This is not the device-information path used by current Connectable setup.
 */

import { uuids } from '../uuids.js';
import { BLEService } from '../service.js';
import { existance, dataviewToString } from '../../functions.js';

// Decode device-provided text bytes; the encoder is an empty placeholder.
function StringCharacteristic() {
    function encode() {}
    function decode(dataview) {
        return dataviewToString(dataview);
    }

    return Object.freeze({
        encode,
        decode,
    });
}

const stringCharacteristic = StringCharacteristic();

// Retained older service design, with a blank default record and optional information callback.
class DeviceInformationService extends BLEService {
    uuid = uuids.deviceInformation;

    // Prepare the callback, default information and yet-to-be-discovered characteristic slots.
    postInit(args) {
        this.onInfo = existance(args.onInfo, ((x) => x));
        this.value  = this.defaultValue();

        this.characteristics = {
            manufacturerNameString: {
                uuid: uuids.f,
                supported: false,
                characteristic: undefined,
            },
            modelNumberString: {
                uuid: uuids.f,
                supported: false,
                characteristic: undefined,
            },
            serialNumberString: {
                uuid: uuids.f,
                supported: false,
                characteristic: undefined,
            },
            hardwareRevisionString: {
                uuid: uuids.f,
                supported: false,
                characteristic: undefined,
            },
            firmwareRevisionString: {
                uuid: uuids.f,
                supported: false,
                characteristic: undefined,
            },
            softwareRevisionString: {
                uuid: uuids.f,
                supported: false,
                characteristic: undefined,
            },
            systemID: {
                uuid: uuids.f,
                supported: false,
                characteristic: undefined,
            },
            regulatoryCertification: {
                uuid: uuids.f,
                supported: false,
                characteristic: undefined,
            },
            PnPID: {
                uuid: uuids.f,
                supported: false,
                characteristic: undefined,
            }
        };
    }
    // Fresh fallback information prevents missing optional strings from leaving undefined fields.
    defaultValue() {
        return {
            manufacturer: 'Unknown',
            model:        '',
            firmware:     '',
        };
    }
    // Discover values and pass readInfo's promise to onInfo; this legacy method does not await that read.
    async start() {
        const self = this;

        self.service = await self.ble.getService(self.server, self.uuid);

        await self.getCharacteristics(self.service);

        const info = self.readInfo();
        self.onInfo(info);
    }
    // Read only supported text characteristics, retaining defaults for fields the device lacks.
    async readInfo() {
        const self = this;

        const info = self.defaultValue();

        if(self.supported('manufacturerNameString')) {
            info['manufacturer'] = await self.read('manufacturerNameString', stringCharacteristic.decode);
        }

        if(self.supported('modelNumberString')) {
            info['model'] = await self.read('modelNumberString', stringCharacteristic.decode);
        }

        if(self.supported('firmwareRevisionString')) {
            info['firmware'] = await self.read('firmwareRevisionString', stringCharacteristic.decode);
        }

        return info;
    }
};

export { DeviceInformationService };
