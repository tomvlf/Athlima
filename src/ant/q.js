/*
 * Matches ANT+ commands to their later replies. A promise is a result the caller
 * can wait for: it succeeds on an accepted reply or fails on rejection/timeout.
 * Commands with the same message ID are matched in the order they were added.
 */

import { events, ids } from './constants.js';

// Create one device's waiting list; timeout is in milliseconds (2000 means two seconds).
function Q({timeout = 2000} = {}) {
    const pending = new Map();

    // Register a packet before sending it, and return the promise for its reply.
    function push(dataview) {
        const id = dataview.getUint8(2, true);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                remove(id, entry);
                reject(new Error(`ANT+ message ${id} timed out.`));
            }, timeout);
            const entry = {resolve, reject, timer};
            const queue = pending.get(id) ?? [];
            queue.push(entry);
            pending.set(id, queue);
        });
    }

    // Match decoded responses, treating channel-close and transfer events as command replies.
    function pull(decoded) {
        let id = decoded.initMsgId;
        if(decoded.eventCode !== undefined) {
            if(decoded.eventCode === events.event_channel_closed) {
                id = ids.closeChannel;
            } else if(decoded.eventCode === events.event_transfer_tx_completed ||
                      decoded.eventCode === events.event_transfer_tx_failed) {
                id = ids.acknowledgedData;
            } else {
                return;
            }
        }

        const entry = pending.get(id)?.[0];
        if(!entry) return;

        if(decoded.valid === false ||
           decoded.eventCode === events.event_transfer_tx_failed ||
           (decoded.responseCode !== undefined &&
            decoded.responseCode !== events.response_no_error)) {
            finish(id, entry, new Error(`ANT+ message ${id} was rejected.`));
            return;
        }
        if(decoded.eventCode === events.event_transfer_tx_completed ||
           decoded.eventCode === events.event_channel_closed ||
           decoded.responseCode === events.response_no_error) {
            finish(id, entry, undefined, decoded);
        }
    }

    // Remove this particular wait, not another command that happens to have the same ID.
    function remove(id, entry) {
        const queue = pending.get(id);
        if(!queue) return;
        const index = queue.indexOf(entry);
        if(index !== -1) queue.splice(index, 1);
        if(queue.length === 0) pending.delete(id);
    }

    // Cancel the timeout and settle the caller's wait exactly when the entry is removed.
    function finish(id, entry, error, value) {
        clearTimeout(entry.timer);
        remove(id, entry);
        if(error) entry.reject(error);
        else entry.resolve(value);
    }

    // Fail outstanding waits when the adapter stops being usable.
    function rejectAll(error = new Error('ANT+ driver closed.')) {
        for(const [id, queue] of pending) {
            for(const entry of queue) finish(id, entry, error);
        }
    }

    return Object.freeze({push, pull, rejectAll});
}

export { Q };
