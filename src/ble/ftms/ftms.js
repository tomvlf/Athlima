/*
 * Uses the standard Bluetooth Fitness Machine Service (FTMS) to read a trainer
 * and control its load. Measurement updates become app data; control-point
 * replies allow later simulation commands. The control point is the device's
 * command channel, and setup first asks permission to control the trainer.
 */

//
// Fitness Machine Service
//

import { exists, expect, wait, } from '../../functions.js';
import { uuids, } from '../web-ble.js';
import { ControlMode, } from '../enums.js';
import { Service } from '../service.js';
import { Characteristic } from '../characteristic.js';
import { indoorBikeData as indoorBikeDataParser } from './indoor-bike-data.js';
import { control as controlParser } from './control-point.js';

// Wrap an existing trainer service and extend Service's setup/start/stop with load-control methods.
function FTMS(args = {}) {

    // config
    const onData = args.onData;

    // BluetoothRemoteGATTService{
    //     device: BluetoothDevice,
    //     uuid: String,
    //     isPrimary: Bool,
    // }
    const gattService = expect(
        args.service, 'FTMS needs BluetoothRemoteGATTService!'
    );
    // end config

    // Service
    // Any received command response releases the simulation write gate; result codes are not checked here.
    function onControlResponse(msg) {
        const control = service.characteristics.control;
        // it's important to release the control characteristic for writes
        // but that can happen only when a response has been received from
        // the control point characteristic
        control.release();
    }

    // Request control after notifications are listening, so the trainer's reply can be received.
    async function protocol() {
        const control = service.characteristics.control;

        if(exists(control)) {
            const res = await control.write(
                controlParser.requestControl.encode()
            );
            return res;
        }

        return false;
    }

    // Send a reset and wait one second for the trainer to settle before returning write success.
    async function reset() {
        const control = service.characteristics.control;

        if(exists(control)) {
            let res = await control.write(controlParser.reset.encode());
            await wait(1000);
            return res;
        }
        return false;
    }

    const spec = {
        measurement: {
            uuid: uuids.indoorBikeData,
            notify: {callback: onData, parser: indoorBikeDataParser},
        },
        control: {
            uuid: uuids.fitnessMachineControlPoint,
            notify: {callback: onControlResponse, parser: controlParser.response},
        },
    };

    const service = Service({service: gattService, spec, protocol, });
    // end sevice

    // methods
    // this service has special write methods

    // Send road grade (%), wind (m/s), rolling resistance and drag settings.
    // Ignore new simulation requests while the previous one is awaiting a reply/timeout.
    async function setSimulation(args = {}) {
        const control = service.characteristics.control;

        if(!exists(control) || !control.isReady()) return false;

        control.block();

        const res = await control.write(
            controlParser.simulationParameters.encode(args)
        );

        return res;
    }

    // Send a watt target with retries; the boolean reports the write, not the trainer's acceptance.
    async function setPowerTarget(args = {}) {
        const control = service.characteristics.control;

        if(!exists(control)) return false;

        const res = await control.writeWithRetry(
            controlParser.powerTarget.encode(args),
            4, 500,
        );
        return res;
    }

    // Send a resistance-level target with retries, using the encoder's tenth-level precision.
    async function setResistanceTarget(args = {}) {
        const control = service.characteristics.control;

        if(!exists(control)) return false;

        const res = await control.writeWithRetry(
            controlParser.resistanceTarget.encode(args),
            4, 500,
        );
        return res;
    }
    // end methods

    // expose public methods and properties
    return Object.freeze({
        ...service, // FTMS will have all the public methods and properties of Service
        protocol,
        reset,
        setSimulation,
        setPowerTarget,
        setResistanceTarget,
    });
}

export default FTMS;
