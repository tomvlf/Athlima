/*
 * Starts and stops ANT+ support with the app. ANT+ is the shared set of radio
 * communication rules used by some trainers and heart-rate sensors. These two
 * device handlers share one USB adapter; opening that adapter still requires
 * the rider to choose it through the browser.
 */

import { xf } from '../functions.js';
import { Controllable, Hrm } from './devices.js';
import { driver } from './driver.js';

const devices = [Controllable(), Hrm()];
let started = false;

// Register the adapter and device listeners once, even if app:start is repeated.
function start() {
    if(started) return;
    started = true;
    driver.init();
    devices.forEach(device => device.start());
}

// Remove device listeners before waiting for the shared adapter to close.
async function stop() {
    if(!started) return;
    started = false;
    devices.forEach(device => device.stop());
    await driver.stop();
}

xf.sub('app:start', start);
xf.sub('app:stop', stop);
