/**
 * Legacy external-service labels and state-token helpers retained for older callers. OAuth is an
 * account-authorization flow used by the removed server integration; the current browser-only app
 * uses a direct Intervals.icu API key instead. These definitions do not restore login, Strava or
 * TrainingPeaks connectivity.
 */

import { uuid } from '../storage/uuid.js';

const DialogMsg = {
    noAuth: ':no-auth',
};

const OAuthService = {
    strava: 'strava',
    intervals: 'intervals',
    trainingPeaks: 'trainingPeaks',
};

/**
 * Create the old service-name/token conversion helpers. store and restore are empty placeholders,
 * not a working authentication store.
 */
function StateParam() {
    /** Join a service name and generated identifier into the legacy state-token format. */
    function encode(name) {
        const param = name+'_'+uuid();
        return param;
    }
    /**
     * Split a legacy state token into service and ID fields; this parses text but does not
     * authenticate it.
     */
    function decode(param) {
        const parts = param.split('_');

        return {
            service: parts[0] ?? '',
            id: parts[1] ?? '',
        };
    }

    function store() {
    }

    function restore() {
    }

    return Object.freeze({
        encode,
        decode,
        store,
        restore,
    });
}

const stateParam = StateParam();

export {
    OAuthService,
    DialogMsg,
    StateParam,
    stateParam,
}

