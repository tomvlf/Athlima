/**
 * Requests a screen wake lock so supported browsers can keep the ride display awake. This is a
 * best-effort browser permission, not a device lock: the browser may refuse or release it. Release
 * and page-exit notifications let other modules attempt ride recovery checkpoints.
 */

import { xf } from './functions.js';

/**
 * Track browser support, initial visibility and whether a screen-awake request is active.
 * Constructing the helper installs its page listeners.
 */
class WakeLock {
    constructor(args) {
        this.lock = undefined;
        this.isLocked = false;
        this.isLocable = false;
        this.isVisible = false;
        this.init();
    }
    /** Detect support, attempt a wake lock and listen for visibility/page-exit events. */
    init() {
        let self = this;
        self.isLocable = ('wakeLock' in navigator);
        self.isVisible = self.checkVisibility();

        self.lockScreen();

        document.addEventListener('visibilitychange', self.onVisibilityChange.bind(self));

        window.addEventListener('beforeunload', e => {
            xf.dispatch('lock:beforeunload');
        });
    }
    checkVisibility() {
        let isVisible = false;
        let visibilityState = document.visibilityState;

        if(visibilityState === 'visible') {
            isVisible = true;
        } else {
            isVisible = false;
        }
        return isVisible;
    }
    /** Attempt another request when the document reports it is visible again. */
    onVisibilityChange () {
        let self = this;

        if(self.checkVisibility()) {
            self.lockScreen();
        }
    }
    /**
     * Ask to keep the screen awake when supported and marked visible. Announce release to
     * checkpoint listeners; log a refusal without preventing the app from running.
     */
    async lockScreen() {
        let self = this;
        if(self.isLocable && self.isVisible) {
            try {
                let lock = await navigator.wakeLock.request('screen');
                self.isLocked = true;

                lock.addEventListener('release', e => {
                    self.isLocked = false;
                    xf.dispatch('lock:release');
                    console.log(`Wake lock released.`);
                });
            } catch(e) {
                console.warn(`wake-lock: not-supported:`, e);
            }
        }
    }
}

const lock = new WakeLock();

export { lock };
