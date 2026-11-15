/*
 * Converts Open Bike Control navigation buttons and dials into named messages.
 * Button ID/state pairs are raw byte values (0–255); dial results use brake
 * percent, steering degrees or camera numbers. Decoding only describes input:
 * it does not navigate screens or change the simulated bike.
 */

//
// OpenBikeControl
// UI Controls
//
// Navigation and view buttons are digital: 0x00 released, 0x01 pressed.
// Brake, steering angle, and camera carry a dial byte with their own scale.

import { equals } from '../../functions.js';

const uiControlsButtonIds = [
    0x10, // up
    0x11, // down
    0x12, // left
    0x13, // right
    0x14, // select
    0x15, // back
    0x16, // menu
    0x17, // home
    0x18, // steerLeft
    0x19, // steerRight
    0x1A, // brake
    0x1B, // steeringAngle
    0x40, // camera
    0x44, // hudToggle
    0x45, // mapToggle
    0x46, // spectate
];

const digitalActions = {
    0x10: 'up',
    0x11: 'down',
    0x12: 'left',
    0x13: 'right',
    0x14: 'select',
    0x15: 'back',
    0x16: 'menu',
    0x17: 'home',
    0x18: 'steerLeft',
    0x19: 'steerRight',
    0x44: 'hudToggle',
    0x45: 'mapToggle',
    0x46: 'spectate',
};

const brakeId = 0x1A;
const steeringAngleId = 0x1B;
const cameraId = 0x40;

const steeringCenter = 0x80;
const steeringStepDegrees = 0.5;
const brakeFullPercent = 100;
const brakeMaxPercent = 200;

// Stateless family decoder; decodePair handles one pair and decode keeps recognized messages in order.
function UIControls() {

    // Accept only released/pressed for ordinary navigation buttons; other states are ignored.
    function decodeDigital(id, state) {
        const action = digitalActions[id];
        if(equals(state, 0x00)) {
            return {id, action, kind: 'digital', state: 'released'};
        }
        if(equals(state, 0x01)) {
            return {id, action, kind: 'digital', state: 'pressed'};
        }

        return;
    }

    // Turn the brake dial into a percentage, capped at 200 for two levers together.
    // 0x01 is a full pull of one brake (100%).
    // 0x02 is 1%, and the scale continues up to 200% for two levers together.
    function decodeBrake(state) {
        if(equals(state, 0x00)) {
            return {id: brakeId, action: 'brake', kind: 'brake', state: 'released'};
        }
        if(equals(state, 0x01)) {
            return {
                id: brakeId,
                action: 'brake',
                kind: 'brake',
                state: 'pressed',
                value: brakeFullPercent,
            };
        }
        const percent = state - 1;
        return {
            id: brakeId,
            action: 'brake',
            kind: 'brake',
            state: 'value',
            value: percent > brakeMaxPercent ? brakeMaxPercent : percent,
        };
    }

    // Convert the steering dial to degrees; preserve unavailable/reserved states without inventing an angle.
    // 0x80 is straight ahead. Each step away from it is half a degree.
    function decodeSteeringAngle(state) {
        if(equals(state, 0x00)) {
            return {
                id: steeringAngleId,
                action: 'steeringAngle',
                kind: 'angle',
                state: 'unavailable',
            };
        }
        if(equals(state, 0x01) || equals(state, 0xFF)) {
            return {
                id: steeringAngleId,
                action: 'steeringAngle',
                kind: 'angle',
                state: 'noop',
            };
        }
        return {
            id: steeringAngleId,
            action: 'steeringAngle',
            kind: 'angle',
            state: 'value',
            value: (state - steeringCenter) * steeringStepDegrees,
        };
    }

    // Camera reports can be a press/release or a numbered camera from 2 through 31.
    function decodeCamera(state) {
        if(equals(state, 0x00)) {
            return {id: cameraId, action: 'camera', kind: 'camera', state: 'released'};
        }
        if(equals(state, 0x01)) {
            return {id: cameraId, action: 'camera', kind: 'camera', state: 'pressed'};
        }
        if(state >= 0x02 && state <= 0x1F) {
            return {id: cameraId, action: 'camera', kind: 'camera', state: 'value', value: state};
        }

        return;
    }

    // Route only IDs owned by this family; unrecognized buttons return no message.
    function decodePair(pair) {
        const id = pair.id;
        const state = pair.state;

        if(id in digitalActions) return decodeDigital(id, state);
        if(equals(id, brakeId)) return decodeBrake(state);
        if(equals(id, steeringAngleId)) return decodeSteeringAngle(state);
        if(equals(id, cameraId)) return decodeCamera(state);

        return;
    }

    // Decode each pair in order, omitting only reports for which no decoder produced a message.
    function decode(pairs = []) {
        const messages = [];

        for(let i = 0; i < pairs.length; i++) {
            const message = decodePair(pairs[i]);
            if(message) messages.push(message);
        }

        return messages;
    }

    return Object.freeze({
        decode,
        decodePair,
    });
}

const uiControls = UIControls();

export {
    UIControls,
    uiControls,
    uiControlsButtonIds,
};
