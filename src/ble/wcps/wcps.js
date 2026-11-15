/*
 * Controls Wahoo trainers using their vendor-specific Bluetooth commands while
 * reading standard Cycling Power measurements. Startup unlocks control and sends
 * rider/bike settings. Changing from power mode to simulated road grade needs
 * two commands in order, so the requested grade waits for a mode-change reply.
 */

//
// Wahoo Cycling Power Service
//

import { exists, expect, wait, } from '../../functions.js';
import { Characteristic } from '../characteristic.js';
import { Service } from '../service.js';
import {
    cyclingPowerMeasurement as cyclingPowerMeasurementParser
} from '../cps/cycling-power-measurement.js';
import { control as controlParser} from './control-point.js';
import { uuids,} from '../web-ble.js';
import { ControlMode, } from '../enums.js';
import { userData } from '../userData.js';

// Extend Service's setup/start/stop lifecycle with Wahoo load controls and reply sequencing.
function WCPS(args = {}) {

    // config
    const onData = args.onData;
    const txRate = 1000;

    // BluetoothRemoteGATTService{
    //     device: BluetoothDevice,
    //     uuid: String,
    //     isPrimary: Bool,
    // }
    const gattService = expect(
        args.service, 'WCPS needs BluetoothRemoteGATTService!'
    );
    // end config

    // private state
    let controlMode = ControlMode.sim;
    let q = [];
    let msgSeqLock = false;
    // end private state

    // service
    // After simulation mode is accepted, send the waiting grade; retry mode setup on rejection.
    // Other replies release the ordinary busy flag.
    function onControlResponse(msg) {
        let control = service.characteristics.control;

        if(msgSeqLock) {
            if(msg.request === 'setSimMode') {
                if(msg.status === 'success') {
                    msgSeqLock = false;
                    setSimulation(q.pop()?.params ?? {grade: 0});
                    return;
                } else {
                    msgSeqLock = true;
                    setSimMode();
                    return;
                }
            }
        }

        control.release();
    }

    // Unlock, send mass/road settings, zero wind and set wheel size, with one-second gaps.
    // This sequence currently returns true without checking each individual write result.
    async function protocol() {
        const control = service.characteristics.control;

        // TODO: return false if any of those fails or
        // returns false and dicsonnect the device
        await requestControl();
        await wait(txRate);
        await setUser();
        await wait(txRate);
        await setWindResistance();
        await wait(txRate);
        await setWheelCircumference();

        return true;
    }

    const spec = {
        measurement: {
            uuid: uuids.cyclingPowerMeasurement,
            notify: {callback: onData, parser: cyclingPowerMeasurementParser},
        },
        control: {
            uuid: uuids.wahooTrainer,
            notify: {callback: onControlResponse, parser: controlParser.response},
        },
    };

    const service = Service({spec, protocol, service: gattService,});
    // end service

    // methods

    // Apply percent grade, entering simulation mode first if needed. Busy updates are ignored.
    function setSimulation(parameters = {}) {
        const control = service.characteristics.control;
        if(!exists(control) || !control.isReady() || msgSeqLock) return false;

        const gradeParams = {grade: parameters.grade};

        // if in erg mode -> init sim mode -> send grade
        // else send grade
        if(controlMode === ControlMode.sim) {
            control.write(controlParser.grade.encode(gradeParams));
            control.block();
        } else {
            msgSeqLock = true;
            q.push({command: "setSimulation", params: gradeParams});
            setSimMode();
        }
    }

    // Convert resistance percent to the encoder's 0–1 intensity and switch local mode tracking.
    function setResistanceTarget(args = {}) {
        const control = service.characteristics.control;
        control.write(controlParser.loadIntensity.encode({
            intensity: (args.resistance / 100),
        }));
        controlMode = ControlMode.resistance;
        // control.block();
    }

    // Send watts for ERG mode (holding a requested power) and remember that mode locally.
    function setPowerTarget(args = {}) {
        const control = service.characteristics.control;
        control.write(controlParser.setERG.encode(args));
        controlMode = ControlMode.erg;
        // control.block();
    }

    // Enter road simulation with combined rider/bike kilograms and optional tyre/air-drag factors.
    function setSimMode(args = {}) {
        const control = service.characteristics.control;
        const weight = userData.userWeight() + userData.bikeWeight();
        control.write(controlParser.sim.encode({
            weight,
            crr: args.crr,
            windResistance: args.windResistance
        }));
        controlMode = ControlMode.sim;
    }

    // Refresh the simulation settings using the current in-memory rider and bicycle weights.
    function setUser() {
        setSimMode();
    }

    // Send Wahoo's fixed unlock command before changing trainer settings.
    async function requestControl() {
        const control = service.characteristics.control;

        const res = await control.write(controlParser.requestControl.encode());

        return res;
    }

    // Despite the method name, this sends zero wind speed, not a drag-coefficient update.
    async function setWindResistance() {
        const control = service.characteristics.control;

        const res = await control.write(controlParser.windSpeed.encode({windSpeed: 0}));

        return res;
    }

    // Send the encoder's default wheel travel per turn, in millimetres.
    async function setWheelCircumference() {
        const control = service.characteristics.control;

        const res = await control.write(
            controlParser.wheelCircumference.encode({
                circumference: controlParser.wheelCircumference.definitions.circumference.default,
            })
        );

        return res;
    }
    // end methods

    return Object.freeze({
        ...service, // WCPS will have all the public methods and properties of Service
        setSimulation,
        setResistanceTarget,
        setPowerTarget,
        setUser,
        setWindResistance,
        setWheelCircumference,
        requestControl,
    });
}

export default WCPS;
