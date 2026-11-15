/**
 * Loads the ride engine and modules whose imports register device, screen and timing listeners,
 * then announces app:start. The platform entry point loads this after mounting its interface and
 * waits for app:ready. The local startServiceWorker helper below is currently not called; normal
 * offline registration belongs to platform/pwa.js.
 */

import { xf } from './functions.js';
import './db.js';
import './views/views.js';
import './ble/devices.js';
import './ble/obc/controls.js';
import './ant/ant.js';
import './watch.js';
import './course.js';
import './lock.js';

/**
 * Registers the app service worker when the browser supports it.
 *
 * The service worker caches shell assets for offline use and refreshes the app in a
 * controlled way. It is intentionally optional so the app can run in desktop-first
 * debug environments without forcing an installed worker.
 */
function startServiceWorker() {
    if('serviceWorker' in navigator) {
        try {
            // const reg = navigator.serviceWorker.register('./sw.js');

            const reg = navigator.serviceWorker.register(
                new URL('./sw.js', import.meta.url),
                {type: 'module'}
            );

            console.log(`SW: register success.`);
        } catch(err) {
            console.log(`SW: register error: `, err);
        }
    };
}

/**
 * Starts the front-end application by dispatching the startup event.
 *
 * This is the entry point that wires the in-browser app to the event bus, loads the
 * active modules, and lets the rest of the UI boot in a consistent order.
 */
function start() {
    console.log('start app.');

    // startServiceWorker(); // stable version only
    xf.dispatch('app:start');
}

/**
 * Stops the application by dispatching the shutdown event.
 *
 * This lets listeners clean up timers, subscriptions, and UI state in a consistent
 * way before the app is torn down.
 */
function stop() {
    xf.dispatch('app:stop');
}

start();

export {
    start,
    stop,
};
