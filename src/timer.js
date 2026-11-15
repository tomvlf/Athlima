/**
 * A small Web Worker, code running outside the page's main UI thread, that sends a tick roughly
 * every second. The ride controller sends start, pause or stop messages. This worker supplies ticks
 * only; it does not decide workout steps or save recordings, and browser scheduling is not a
 * precision stopwatch guarantee.
 */

var interval;

/**
 * Begin sending tick messages to the page once per second. The controller is responsible for the
 * start/pause lifecycle.
 */
function onStart() {
    interval = setInterval(function(){
        self.postMessage('tick');
    }, 1000);
}

/** Cancel the current repeating timer; both pause and stop messages use this operation. */
function onStop() {
    clearInterval(interval);
}

self.addEventListener('message', function(e) {
    switch (e.data) {
    case 'start': onStart(); break;
    case 'stop':  onStop(); break;
    case 'pause': onStop(); break;
    };
}, false);
