/*
 * Owns the browser's connection to the shared ANT+ adapter. It chooses native
 * serial access or the USB fallback, sends outgoing messages, and routes incoming
 * packets (complete groups of transmitted bytes) to radio-channel listeners.
 * App events announce connection progress and errors to the rest of Athlima.
 */

import { xf } from '../functions.js';
import { SerialDriver, SerialPolyfillDriver } from './web-serial.js';

let _driver;
let _abortController;
let _opening;
let _operation = Promise.resolve();
let _started = false;

// Prefer Web Serial; otherwise use the USB compatibility layer, without opening a device yet.
function setup() {
    if(navigator.serial?.requestPort) {
        _driver = SerialDriver({
            onData: onRx,
            onClose: () => xf.dispatch('ant:driver:closed'),
        });
        return {available: true, driver: 'web-serial'};
    }
    if(navigator.usb?.requestDevice) {
        _driver = SerialPolyfillDriver({
            onData: onRx,
            onClose: () => xf.dispatch('ant:driver:closed'),
        });
        return {available: true, driver: 'web-usb'};
    }
    _driver = undefined;
    return {available: false};
}

// Attach the UI and transmit listeners once; the abort controller removes them together.
function start() {
    if(_started) return;
    _abortController = new AbortController();
    const options = {signal: _abortController.signal};
    xf.sub('ui:ant:driver:switch', onSwitch, options);
    xf.sub('ant:driver:tx', onTx, options);
    _started = true;
}

// Stop listening for app commands and return the adapter's asynchronous close operation.
function stop() {
    _abortController?.abort();
    _started = false;
    return close();
}

// Queue whole command sequences so two sensors cannot reconfigure the adapter at once.
// A failed sequence is reported to its caller but must not block later sequences.
function runExclusive(operation) {
    const result = _operation.then(operation);
    _operation = result.catch(() => {});
    return result;
}

// Mark unsupported connection panels and publish which browser connection method is available.
function init() {
    const result = setup();
    const antControllable = document.querySelector('#ant-controllable-settings');
    const antHrm = document.querySelector('#ant-hrm-settings');

    [antControllable, antHrm].filter(Boolean).forEach(element => {
        element.classList.toggle('ant-not-supported', !result.available);
    });

    if(result.available) {
        start();
        xf.dispatch('ant:driver:enable', result.driver);
    } else {
        xf.dispatch('ant:driver:disable');
    }
    return result;
}

// Share an in-progress device-opening request rather than showing multiple chooser dialogs.
async function open() {
    if(!_driver) {
        const result = setup();
        if(!result.available) throw new Error('ANT+ is not supported by this browser.');
    }
    if(_driver.isOpen()) return;
    if(_opening) return _opening;

    xf.dispatch('ant:driver:connecting');
    _opening = _driver.open(onOpen)
        .catch(error => {
            xf.dispatch('ant:driver:error', error);
            xf.dispatch('ant:driver:closed');
            throw error;
        })
        .finally(() => {
            _opening = undefined;
        });
    return _opening;
}

// Announce closure even when no adapter was open, so device state can be cleared.
async function close() {
    if(_driver?.isOpen()) await _driver.close();
    else xf.dispatch('ant:driver:closed');
}

// Translate the rider's adapter switch into open/close, keeping failures in the event flow.
async function onSwitch() {
    try {
        if(_driver?.isOpen()) await close();
        else await open();
    } catch(error) {
        console.error('Unable to connect ANT+ adapter:', error);
    }
}

// Tell device handlers they may begin configuration and tell the UI the adapter is connected.
function onOpen() {
    xf.dispatch('ant:driver:ready');
    xf.dispatch('ant:driver:connected');
}

// Reject incomplete packets before using their channel number; checksum checks happen later.
function onRx(data) {
    if(!data || data.length < 4 || data[0] !== 0xA4 ||
       data.length !== data[1] + 4) {
        console.warn('Ignoring malformed ANT+ message.', data);
        return;
    }
    const channel = data[3] & 0x1F;
    channelDispatch(channel, data);
}

// Channel zero is shared here: give each channel its own copy so listeners cannot alter others' data.
function channelDispatch(channel, data) {
    const bytes = Uint8Array.from(data);
    if(channel === 0) {
        for(let channelNumber = 0; channelNumber < 8; channelNumber++) {
            xf.dispatch(`ant:driver:${channelNumber}:rx`, new DataView(bytes.slice().buffer));
        }
    } else {
        xf.dispatch(`ant:driver:${channel}:rx`, new DataView(bytes.buffer));
    }
}

// Write one prepared packet and publish failures for devices waiting on its reply.
async function onTx(dataview) {
    try {
        if(!_driver?.isOpen()) throw new Error('ANT+ adapter is not open.');
        await _driver.write(dataview);
    } catch(error) {
        xf.dispatch('ant:driver:error', error);
        console.error('Unable to write to ANT+ adapter:', error);
    }
}

const driver = Object.freeze({init, start, stop, open, close, runExclusive});

export {driver};
