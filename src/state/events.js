/**
 * Repository-owned event names used across startup, ride, Coach, activity, UI and provider flows.
 * Keep this list centralized so modules do not invent incompatible spellings.
 */
export const APP_EVENTS = Object.freeze({
    start: 'app:start',
    ready: 'app:ready',
    error: 'app:error',
    stop: 'app:stop',
});

export const DB_EVENTS = Object.freeze({
    start: 'db:start',
    field: field => `db:${field}`,
});

export const COACH_EVENTS = Object.freeze({
    changed: 'coaching:changed',
    error: 'coaching:error',
});

export const ACTIVITY_EVENTS = Object.freeze({
    add: 'activity:add',
    saving: 'activity:saving',
    discarded: 'activity:discarded',
    saveSuccess: 'activity:save:success',
    saveFail: 'activity:save:fail',
    retrySave: 'activity:retry-save',
    restore: 'activity:restore',
});

export const WATCH_EVENTS = Object.freeze({
    start: 'ui:watchStart',
    stop: 'ui:watchStop',
    workoutStart: 'ui:workoutStart',
});

export const UI_EVENTS = Object.freeze({
    pageSet: 'ui:page-set',
    moreMenuClose: 'ui:more-menu-close',
});
