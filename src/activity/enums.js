/**
 * Shared names for ride timing and activity events. An enum is a list of agreed labels so
 * recording, playback and FIT conversion use the same meanings. These values are data definitions,
 * not actions; changing a label can change how an activity event is interpreted.
 */

const TimerStatus = {
    stopped: 'stopped',
    started: 'started',
    paused: 'paused',
    resumed: 'resumed',
};

const TimerAction = {
    start: 'start',
    stop: 'stop',
    pause: 'pause',
};

const EventType = {
    start: 'start',
    stop: 'stop',
};

export {
    TimerStatus,
    TimerAction,
    EventType,
};

