/**
 * The optional direct connection from this browser to Intervals.icu. It keeps the API key and
 * import progress locally, fetches profiles/history/planned workouts and uploads FIT files.
 * Requests go only to the fixed provider address, not an Athlima server. Full synchronization runs
 * only while the page is open; completed batches provide restart points.
 */
import { xf } from '../functions.js';
import { isoDate } from '../utils.js';
import { addDays, date } from '../coaching/domain.js';
import { normalizeActivity } from '../coaching/normalizer.js';
import { intervalsActivity, compactProfile } from './intervals-data.js';

const API = 'https://intervals.icu/api/v1';
const KEY = 'athlima-intervals-v1';
const validAthleteId = id => /^(?:i)?\d{1,20}$/.test(String(id));
let syncing = false;

/**
 * Find the saved connection. A remembered connection lives in localStorage; a session-only one
 * lives in sessionStorage and disappears when the tab closes. Return the store too so progress
 * updates stay in the same place and a remembered key is never silently recreated.
 */
function storedEntry() {
    for(const store of [window.localStorage, window.sessionStorage]) {
        const value = store.getItem(KEY);
        if(value) return {value, store};
    }
    return {value: null, store: null};
}

/**
 * Read and validate the saved connection. Return null only when disconnected; malformed stored
 * settings produce an actionable error instead of pretending the user is disconnected.
 */
function saved() {
    const {value} = storedEntry();
    if(!value) return null;
    const result = JSON.parse(value);
    if(typeof result.apiKey !== 'string' || !result.apiKey || !validAthleteId(result.athleteId)) {
        throw new Error('Stored Intervals.icu connection is invalid. Disconnect and reconnect in Settings.');
    }
    date(result.oldest);
    return result;
}

/** The store currently holding this tab's connection, preferring a remembered connection. */
function connectionStore() {
    return window.localStorage.getItem(KEY) ? window.localStorage : window.sessionStorage;
}

/**
 * Expose connection/progress information for screens without returning the API key. configured
 * means the integration is available, not that an account is connected.
 */
function status() {
    const connection = saved();
    return {configured: true, connected: Boolean(connection),
        remembered: Boolean(window.localStorage.getItem(KEY)),
        status: syncing ? 'running' : connection?.error ? 'error' : connection ? 'connected' : 'disconnected',
        athleteId: connection?.athleteId, oldest: connection?.oldest,
        lastSuccess: connection?.lastSuccess, nextDate: connection?.nextDate,
        through: connection?.through, error: connection?.error, skipped: connection?.skipped || []};
}

/**
 * Send one provider request with the API key in the Authorization header, never the URL. Omit
 * cookies, reject redirects, time out stalled requests and translate provider/network/JSON failures
 * into user-facing errors.
 */
async function request(path, {query, body, method = 'GET', connection = saved()} = {}) {
    if(!connection) throw new Error('Connect Intervals.icu in Settings first.');
    let response;
    try {
        response = await fetch(`${API}${path}${query ? `?${new URLSearchParams(query)}` : ''}`, {
            method, ...(body ? {body} : {}),
            headers: {Authorization: `Basic ${btoa(`API_KEY:${connection.apiKey}`)}`, Accept: 'application/json'},
            credentials: 'omit', cache: 'no-store', redirect: 'error',
            signal: AbortSignal.timeout(25000),
        });
    } catch {
        throw new Error('Intervals.icu could not be reached. Check your connection and browser access to Intervals.icu, then retry.');
    }
    if(!response.ok) {
        const error = new Error(response.status === 401 || response.status === 403
            ? 'Intervals.icu rejected the API key. Reconnect in Settings.'
            : response.status === 429 ? 'Intervals.icu rate limit reached. Wait before retrying.'
                : 'Intervals.icu could not complete the request. Please retry.');
        error.status = response.status;
        throw error;
    }
    try { return await response.json(); }
    catch { throw new Error('Intervals.icu returned an unreadable response. Please retry.'); }
}

/**
 * Use the verified athlete ID from the saved connection for subsequent requests, refusing calls
 * made before connecting.
 */
const athletePath = (connection = saved()) => {
    if(!connection) throw new Error('Connect Intervals.icu in Settings first.');
    return `/athlete/${connection.athleteId}`;
};

/**
 * Validate the key and import date, test them by resolving /athlete/0, then save the real athlete
 * ID. With no key argument, open Settings instead. Do not overwrite a connection changed by another
 * tab during the test.
 */
async function connect({apiKey, oldest, remember = true} = {}) {
    if(apiKey === undefined) {
        window.location.hash = '/settings';
        xf.dispatch('ui:page-set', 'settings');
        return;
    }
    if(syncing) throw new Error('Wait for the current import before reconnecting.');
    if(typeof apiKey !== 'string' || !/^[\x21-\x7e]{1,1024}$/.test(apiKey.trim())) {
        throw new Error('Enter your Intervals.icu personal API key.');
    }
    date(oldest);
    if(oldest > isoDate() || oldest < addDays(isoDate(), -3660)) {
        throw new Error('Choose an import date within the last ten years.');
    }
    // A remembered connection survives a tab close; a session-only one does not.
    const target = remember ? window.localStorage : window.sessionStorage;
    const other  = remember ? window.sessionStorage : window.localStorage;
    const previous = window.localStorage.getItem(KEY);
    const connection = {apiKey: apiKey.trim(), athleteId: '0', oldest};
    const athlete = await request('/athlete/0', {connection});
    const id = athlete?.id ?? athlete?.athlete?.id ?? athlete?.user_id ?? athlete?.athleteId;
    if(!validAthleteId(id)) throw new Error('Intervals.icu returned an unexpected athlete profile.');
    if(window.localStorage.getItem(KEY) !== previous) throw new Error('The Intervals.icu connection changed in another tab. Retry.');
    connection.athleteId = String(id);
    target.setItem(KEY, JSON.stringify(connection));
    other.removeItem(KEY);
    xf.dispatch('services', {intervals: true});
    return status();
}

/**
 * Remove saved credentials and connection progress, not imported training history. Refuse while
 * this page's import is running.
 */
function disconnect() {
    if(syncing) throw new Error('Wait for the current import before disconnecting.');
    window.localStorage.removeItem(KEY);
    window.sessionStorage.removeItem(KEY);
    xf.dispatch('services', {intervals: false});
    return status();
}

/**
 * Fetch the profile of the athlete resolved during connection, rather than assuming the athlete/0
 * alias for later calls.
 */
async function athlete() {
    return request(athletePath());
}

/**
 * Fetch dated workout events for up to 63 days and keep those containing a ZWO file. Announce
 * success/failure for the calendar and surface errors to the rider.
 */
async function wod(oldest = isoDate(), newest = isoDate()) {
    try {
        date(oldest);
        date(newest);
        if(oldest > newest || newest > addDays(oldest, 62)) throw new Error('Request at most 63 days of planned workouts.');
        const events = await request(`${athletePath()}/events`, {
            query: {oldest, newest, category: 'WORKOUT', ext: 'zwo', resolve: 'true'},
        });
        if(!Array.isArray(events)) throw new Error('Intervals.icu returned an unexpected event list.');
        xf.dispatch('action:planned', ':intervals:wod:success');
        return events.filter(event => event.workout_file_base64);
    } catch(error) {
        xf.dispatch('action:planned', ':intervals:wod:fail');
        xf.dispatch('ui:modal:error:open', error.message);
        throw error;
    }
}

/**
 * Upload a saved FIT file with a stable athlima:<record-id> label so importing it later can
 * recognize the original recording. Return the existing success/fail status string and show upload
 * errors.
 */
async function uploadWorkout(record) {
    try {
        if(!record?.blob || !/^[\w-]{1,100}$/.test(record.id)) throw new Error('Choose a valid FIT recording.');
        const form = new FormData();
        form.append('file', record.blob, `${record.id}.fit`);
        await request(`${athletePath()}/activities`, {method: 'POST', body: form,
            query: {name: record.summary?.name || 'Athlima workout', external_id: `athlima:${record.id}`}});
        return ':success';
    } catch(error) {
        xf.dispatch('ui:modal:error:open', error.message);
        return ':fail';
    }
}

/**
 * Extract body mass and cycling FTP, preferring indoor/VirtualRide settings when supplied. This
 * mapping does not yet validate the profile.
 */
function athleteToSettings(athlete = {}, defaults = {weight: 0, ftp: 0}) {
    const settings = athlete.sportSettings || [];
    const selected = settings.find(setting => setting.types?.includes('VirtualRide')) ||
        settings.find(setting => setting.types?.includes('Ride'));
    return {weight: athlete.weight ?? athlete.icu_weight ?? defaults.weight,
        ftp: selected?.indoor_ftp ?? selected?.ftp ?? defaults.ftp};
}

/** Fetch and map the provider profile while announcing a result to the existing settings listeners. */
async function getAthlete() {
    try {
        const result = athleteToSettings(await athlete());
        xf.dispatch('action:athlete', ':intervals:athlete:success');
        return result;
    } catch(error) {
        xf.dispatch('action:athlete', ':intervals:athlete:fail');
        xf.dispatch('ui:modal:error:open', error.message);
        throw error;
    }
}

/**
 * Validate both FTP and body mass, confirm the connection did not change mid-request, then announce
 * them together. Invalid responses must not partly replace the cached profile.
 */
async function syncProfile() {
    const connection = saved();
    if(!connection) throw new Error('Connect Intervals.icu in Settings first.');
    const profile = await getAthlete();
    if(!Number.isInteger(profile.ftp) || profile.ftp < 1 || profile.ftp > 1500 ||
        !Number.isFinite(profile.weight) || profile.weight < 1 || profile.weight > 500) {
        throw new Error('Set a valid cycling FTP and body mass in Intervals.icu, then retry profile sync.');
    }
    const current = saved();
    if(current?.apiKey !== connection.apiKey || current?.athleteId !== connection.athleteId) {
        throw new Error('The Intervals.icu connection changed while syncing your profile. Retry.');
    }
    xf.dispatch('intervals:profile', profile);
    return profile;
}

/**
 * Import history in 31-day batches, validating activities and reporting skipped records. Save
 * progress after each batch; on later syncs recheck a recent overlap. Review overdue sessions after
 * the final batch so imported completions can match first.
 */
async function sync(service, onProgress = () => {}) {
    if(syncing) throw new Error('An Intervals.icu import is already running.');
    const connection = saved();
    if(!connection) throw new Error('Connect Intervals.icu first.');
    const store = connectionStore();
    let persisted = store.getItem(KEY);
    /**
     * Detect another tab changing connection settings before importing or recording progress under
     * the wrong account.
     */
    const checkConnection = () => {
        if(store.getItem(KEY) !== persisted) {
            throw new Error('The Intervals.icu connection changed in another tab. Retry with the current settings.');
        }
    };
    /**
     * Persist the batch checkpoint only while the saved connection still matches the one this
     * import started with.
     */
    const saveProgress = () => {
        checkConnection();
        const next = JSON.stringify(connection);
        store.setItem(KEY, next);
        persisted = next;
    };
    const through = isoDate();
    let cursor = connection.nextDate || (connection.lastSuccess
        ? [connection.oldest, addDays(connection.lastSuccess.slice(0, 10), -7)].sort().at(-1) : connection.oldest);
    connection.error = null;
    if(!connection.nextDate) connection.skipped = [];
    syncing = true;
    try {
        while(cursor <= through) {
            const newest = [addDays(cursor, 30), through].sort()[0];
            const received = await request(`${athletePath(connection)}/activities`, {
                connection, query: {oldest: cursor, newest},
            });
            if(!Array.isArray(received)) throw new Error('Intervals.icu returned an unexpected activity list.');
            const raw = [];
            for(const item of received) {
                let activity;
                try {
                    activity = intervalsActivity(item, new Date().toISOString());
                    if(!activity) throw new Error('Missing activity ID, start time or duration.');
                    normalizeActivity(activity, service.data.profile || undefined);
                } catch(error) {
                    console.warn('Skipping invalid Intervals.icu activity:', error.message);
                    connection.skipped = [...(connection.skipped || []),
                        `${item?.start_date || 'undated'} ${item?.name || item?.id || 'activity'}`].slice(-50);
                    continue;
                }
                const previous = service.data.activities.find(entry => entry.id === activity.id);
                if(previous && previous.details?.analyzed === activity.details.analyzed &&
                    (previous.powerProfile || previous.heartRateProfile)) {
                    activity.powerProfile = previous.powerProfile ?? undefined;
                    activity.heartRateProfile = previous.heartRateProfile ?? undefined;
                    activity.maximumPower = previous.original?.maximumPower;
                } else if(Array.isArray(item.stream_types) && item.stream_types.some(type => ['watts', 'heartrate'].includes(type))) {
                    let streams;
                    try {
                        streams = await request(`/activity/${encodeURIComponent(String(item.id))}/streams.json`, {
                            connection, query: {types: 'watts,heartrate'},
                        });
                    } catch(error) {
                        if(![400, 404].includes(error.status)) throw error;
                        console.warn('Intervals.icu has no accessible streams for this activity:', item.id);
                        raw.push(activity);
                        continue;
                    }
                    if(!Array.isArray(streams)) throw new Error('Intervals.icu returned invalid activity streams.');
                    const watts = streams.find(stream => stream.type === 'watts')?.data;
                    activity.powerProfile = compactProfile(watts) ?? undefined;
                    activity.heartRateProfile = compactProfile(streams.find(stream => stream.type === 'heartrate')?.data) ?? undefined;
                    if(Array.isArray(watts)) activity.maximumPower = watts.reduce((max, value) =>
                        Number.isFinite(value) && value <= 3000 ? Math.max(max, value) : max, 0) || undefined;
                }
                raw.push(activity);
            }
            checkConnection();
            await service.importActivities(raw);
            cursor = addDays(newest, 1);
            connection.nextDate = cursor <= through ? cursor : null;
            connection.through = through;
            saveProgress();
            onProgress(status());
        }
        await service.advance();
        connection.lastSuccess = new Date().toISOString();
        connection.nextDate = null;
        saveProgress();
    } catch(error) {
        connection.error = error.message;
        if(store.getItem(KEY) === persisted) saveProgress();
        throw error;
    } finally { syncing = false; }
    return status();
}

/**
 * Fetch detailed measurements and an optional route on demand. Validate their shapes and bounds; an
 * invalid route can be omitted with an explanation while valid measurements remain usable.
 */
async function activityData(activityId) {
    if(typeof activityId !== 'string' || !/^[\w-]{1,100}$/.test(activityId)) throw new Error('Invalid Intervals.icu activity ID.');
    /**
     * Treat provider 400/404 responses as an unavailable optional resource, while propagating
     * authentication, rate-limit and network failures.
     */
    const optional = async path => {
        try { return await request(path); }
        catch(error) {
            if([400, 404].includes(error.status)) return null;
            throw error;
        }
    };
    const [received, map] = await Promise.all([
        request(`/activity/${encodeURIComponent(activityId)}/streams.json`, {query: {types: 'watts,heartrate,cadence,time'}})
            .catch(error => {
                if([400, 404].includes(error.status)) return [];
                throw error;
            }),
        optional(`/activity/${encodeURIComponent(activityId)}/map`),
    ]);
    if(!Array.isArray(received)) throw new Error('Intervals.icu returned invalid activity streams.');
    const streams = {};
    for(const type of ['watts', 'heartrate', 'cadence', 'time']) {
        const values = received.find(stream => stream.type === type)?.data;
        if(values == null) continue;
        if(!Array.isArray(values) || values.length > 200000 || values.some(value => value != null && !Number.isFinite(value))) {
            throw new Error('Intervals.icu returned invalid activity stream data.');
        }
        streams[type] = values;
    }
    if(!map) return {streams, map: null};
    const points = map.latlngs;
    if(!Array.isArray(points) || points.length > 200000 || points.some(point => point !== null &&
        (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
            Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180))) {
        return {streams, map: null, routeError: 'The route contains invalid locations. Activity measurements are still available.'};
    }
    return {streams, map: {latlngs: points.filter(point => point !== null)}};
}

export default Object.freeze({connect, disconnect, status, sync, athlete, activityData,
    wod, uploadWorkout, getAthlete, syncProfile, athleteToSettings, update() {}});
