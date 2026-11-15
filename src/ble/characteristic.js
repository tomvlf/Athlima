/*
 * Wraps one Bluetooth characteristic: a named place on a device where the app
 * can read a value, write a command or receive automatic updates (notifications).
 * Values arrive as bytes, small numbered pieces of data; a service-specific
 * decoder turns them into measurements. This layer manages browser calls only.
 */

import { exists, arrayBufferToArray, wait, time, print, } from '../functions.js';
import { webBle } from './web-ble.js';

/**
 * Add retries and a ready flag to a browser characteristic. block/release are a
 * caller-managed pause while awaiting a command reply; isReady only reads it.
 * responseTimeout and retry delays are milliseconds.
 */
function Characteristic(args = {}) {
    //
    // config
    //
    // BluetoothRemoteGATTCharacteristic
    const _characteristic = args.characteristic;

    // Uuid
    const uuid = _characteristic.uuid;

    // String
    const name = args.name ?? webBle.uuidToName(_characteristic.uuid);

    // Function
    // some browsers don't have writeValueWithResponse,
    // but writeValue is depricated, so try the first or fallback to last.
    const writterFn = exists(_characteristic.writeValueWithResponse) ?
          'writeValueWithResponse' :
          'writeValue';

    // Int, ms
    const responseTimeout = args.responseTimeout ?? 1000;

    // end  config

    //
    // state
    //
    // private state

    // Int
    let _responseTimeoutId;

    // Bool
    let _ready = true;

    let abortController;
    let signal;

    // end private state
    // end state

    // accesor methods
    function isReady() {
        return _ready;
    }
    // end accesor methods

    //
    // methods
    //

    // Subscribe to device updates and pass their DataView to handler; return false on browser errors.
    async function startNotifications(handler) {
        try {
            abortController = new AbortController();
            signal = { signal: abortController.signal };

            await _characteristic.startNotifications();
            _characteristic.addEventListener(
                'characteristicvaluechanged', (e) => handler(e.target.value), signal
            );

            print.log(`tx: notifications: started: on: ${name} ${uuid}.`);
            return true;
        } catch(e) {
            console.error(`notifications: failed: starting: on: name: ${name} uuid: ${uuid}`, e);
            return false;
        }
    }

    // Try once plus the requested retries; failed attempts wait before trying again.
    async function startNotificationsWithRetry(handler, attempts = 10, txRate = 250) {
        const success = await startNotifications(handler);
        if(success) {
            return true;
        } else {
            if(attempts > 0) {
                await wait(txRate);
                print.log(`tx: startNotificationsWithRetry: fail: 'trying again'`);
                return await startNotificationsWithRetry(handler, attempts-1);
            } else {
                print.log(`tx: startNotificationsWithRetry: fail: 'give up'`);
                return false;
            }
        }
    }

    // Stop device updates and remove the listener installed by startNotifications.
    async function stopNotifications(handler) {
        try {
            await _characteristic.stopNotifications();
            abortController.abort();

            print.log(`notifications: stopped: on: ${name} ${uuid}.`);
            return true;
        } catch(e) {
            console.error(`notifications: failed: stopping: on: name: ${name} uuid: ${uuid}`, e);
            return false;
        }
    }

    // Read the current raw value, returning the caller's fallback if the device read fails.
    async function read(args = {}) {
        const fallback = args.fallback;

        try{
            const value = await _characteristic.readValue();
            return value;
        } catch(e) {
            console.error(`rx: characteristic: :failed :read on: ${name} uuid: ${uuid}`, e);
            return fallback;
        }
    }

    // Send prepared bytes using the supported browser write method; report success as true/false.
    async function write(value) {
        let res;
        try{
            res = await _characteristic[writterFn](value);
            return true;
        } catch(e) {
            print.warn(`tx: characteristic: failed: write: on: ${name} uuid: ${uuid} value: [${arrayBufferToArray(value)}]`, e);
            return false;
        }
    }

    // Retry a failed byte write; this confirms browser delivery, not the trainer's command result.
    async function writeWithRetry(value, attempts = 10, txRate = 250) {
        let success = await write(value);
        if(success) {
            print.log(`tx: characteristic: writeWithRetry: success:`);
            return true;
        } else {
            if(attempts > 0) {
                print.log(`tx: characteristic: writeWithRetry: fail: continue:`);
                await wait(txRate);
                return await writeWithRetry(value, attempts-1);
            } else {
                print.log(`tx: characteristic: writeWithRetry: fail: break:`);
                return false;
            }
        }
    }

    // Mark the characteristic busy, with a timeout so a missing reply cannot block it forever.
    function block() {
        _responseTimeoutId = setTimeout(release, responseTimeout);
        _ready = false;
    }

    // A reply or timeout makes the characteristic available for another command.
    function release() {
        clearTimeout(_responseTimeoutId);
        _ready = true;
    }
    // end methods

    return Object.freeze({
        startNotifications,
        startNotificationsWithRetry,
        stopNotifications,
        read,
        write,
        writeWithRetry,

        isReady,
        block,
        release,
    });
}

export { Characteristic };

