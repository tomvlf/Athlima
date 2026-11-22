/**
 * The ride engine's models: helpers that hold, convert and save measurements, settings, workouts
 * and recordings. A workout is a recipe to follow; an activity is the record of what happened; a
 * session is a ride still in progress. Small measurement/settings subclasses share the Model hooks
 * below rather than implementing independent workflows. Live updates use xf messages, while saves
 * explicitly call browser storage.
 */

import { xf, exists, existance, empty, equals, mavg, avg, max,
         first, second, last, clamp, toFixed, isArray,
         isString, isObject } from '../functions.js';

import { inRange, dateToDashString, getStartEndOfWeek, isToday, timeDiff, pad } from '../utils.js';

import { LocalStorageItem } from '../storage/local-storage.js';
import { idb } from '../storage/idb.js';
import { uuid } from '../storage/uuid.js';

import API from './api.js';
import { workouts as workoutsFile }  from '../workouts/workouts.js';
import { zwo } from '../workouts/zwo.js';
import { fileHandler } from '../file.js';
import { Model as Cycling } from '../physics.js';
import { fit } from '../fit/fit.js';

import { Device, Status, ControlMode, } from '../ble/enums.js';
import { TimerStatus, EventType, } from '../activity/enums.js';
import { fromRecordedRide } from '../coaching/normalizer.js';

/**
 * Reduce valid recorded power samples to at most the requested number of averages for a compact
 * preview chart. This is not the full one-second stream used for analysis.
 */
function summarizePowerProfile(samples, maximum = 64) {
    if(!Array.isArray(samples) || samples.length < 2) return undefined;
    const validSamples = samples.filter(value => Number.isFinite(value) && value >= 0);
    if(validSamples.length < 2) return undefined;

    const bucketCount = Math.min(maximum, validSamples.length);
    return Array.from({length: bucketCount}, (_, index) => {
        const start = Math.floor(index * validSamples.length / bucketCount);
        const end = Math.max(start + 1, Math.floor((index + 1) * validSamples.length / bucketCount));
        const bucket = validSamples.slice(start, end);
        return bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
    });
}

/**
 * Common setup for one live value. init/postInit are optional setup hooks; defaultValue supplies
 * its initial value, defaultIsValid checks input and defaultParse converts restored data. Simple
 * subclasses mainly override those defaults and units.
 */
class Model {
    /**
     * Run early setup, select the configured or default conversion/validation functions, then let
     * the subclass finish configuring storage and limits.
     */
    constructor(args = {}) {
        this.init(args);
        this.prop      = args.prop;
        this.default   = existance(args.default, this.defaultValue());
        this.prev      = args.default;
        this.set       = existance(args.set, this.defaultSet);
        this.parser    = existance(args.parser, this.defaultParse);
        this.isValid   = existance(args.isValid, this.defaultIsValid);
        this.onInvalid = existance(args.onInvalid, this.defaultOnInvalid);
        this.storage   = this.defaultStorage();
        this.postInit(args);
    }
    init() { return; }
    postInit() { return; }
    defaultValue() { return ''; }
    defaultIsValid(value) { return exists(value); }
    /**
     * Validate before replacing the model's state. Invalid values are logged and the default is
     * returned, without assigning the invalid value.
     */
    defaultSet(value) {
        const self = this;
        if(self.isValid(value)) {
            self.state = value;
            // console.log(`${this.prop} : ${this.state}`);
            return value;
        } else {
            self.defaultOnInvalid(value);
            return self.default;
        }
    }
    defaultParse(value) {
        return value;
    }
    defaultOnInvalid(x) {
        const self = this;
        console.error(`Trying to set invalid ${self.prop}. ${typeof x}`, x);
    }
    /**
     * Supply the nonpersistent placeholder. Models that actually save settings replace it with a
     * browser-storage adapter.
     */
    defaultStorage() {
        const self = this;
        return {add: ((x)=>x),
                restore: ((_)=> self.default)};
    }
    /**
     * Ask this model's configured storage adapter to save the value; models without a writable
     * adapter must not use this path.
     */
    backup(value) {
        const self = this;
        self.storage.set(value);
    }
    /** Read the adapter's saved/default value and apply the model's parser before returning it. */
    restore() {
        const self = this;
        return self.parser(self.storage.restore());
    }
}

/**
 * Configure a power reading and its expected range in watts. A watt measures rate of work, not
 * accumulated energy.
 */
class Power extends Model {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 2500);
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
}

/** Configure a heart-rate reading in beats per minute and its expected whole-number range. */
class HeartRate extends Model {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 255);
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        const self = this;
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
}

/**
 * Configure a pedalling cadence reading in revolutions per minute and its expected whole-number
 * range.
 */
class Cadence extends Model {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 255);
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
}

/**
 * Hold speed configuration and explicit conversions between kilometres/hour, metres/second and
 * miles/hour. Callers must choose the conversion matching their source units.
 */
class Speed extends Model {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 120);
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        return (Number.isInteger(value) || Number.isFloat(value)) &&
                inRange(self.min, self.max, value);
    }
    kmhToMps(kmh) {
        return kmh / 3.6;
    }
    mpsToKmh(mps) {
        return mps * 3.6;
    }
    mpsToMph(mps) {
        return mps * 2.23693629;
    }
    kmhToMph(kmh) {
        return kmh * 0.621371192;
    }
}

/**
 * Configure the muscle-oxygen percentage reported by a compatible sensor and the thresholds used to
 * display it. These are display values, not medical interpretations.
 */
class SmO2 extends Model {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 100);
        this.zones = {
            one: 30,
            two: 70,
            three: 100,
        };
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        return inRange(self.min, self.max, value);
    }
}

/**
 * Configure the total-haemoglobin reading supplied by a compatible muscle-oxygen sensor, separate
 * from its oxygen-percentage reading.
 */
class THb extends Model {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 400);
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        return inRange(self.min, self.max, value);
    }
}

/**
 * Remember which connected device supplies each measurement and trainer control, together with
 * ride-display and automatic start/pause preferences.
 */
class Sources extends Model {
    /**
     * Follow live source-map changes and configure JSON storage, allowing the chosen devices and
     * display options to survive a reload.
     */
    postInit(args = {}) {
        const self = this;
        self.state = self.default;
        xf.sub('db:sources', value => self.state = value);

        const storageModel = {
            key: self.prop,
            fallback: self.defaultValue(),
            parse: JSON.parse,
            encode: JSON.stringify
        };

        self.storage = new args.storage(storageModel);
    }
    /**
     * Merge a partial preference update into the existing map so changing one setting does not
     * discard the others.
     */
    defaultSet(target, source) {
        return Object.assign(target, source);
    }
    /**
     * Check whether the announced device is the selected source for a measurement before accepting
     * its readings.
     */
    isSource(path, value) {
        const self = this;
        if(exists(self.state[path])) {
            return equals(self.state[path], value);
        }
        return false;
    }
    defaultValue() {
        const sources = {
            // device data source map
            power:        'ble:controllable',
            cadence:      'ble:controllable',
            speed:        'ble:controllable',
            control:      'ble:controllable',
            heartRate:    'ble:heartRateMonitor',
            smo2:         'ble:smo2',
            thb:          'ble:smo2',
            coreBodyTemperature: 'ble:coreTemp',
            skinTemperature:     'ble:coreTemp',

            // settings
            virtualState: 'power',
            autoPause:    true,
            autoStart:    true,
            theme:        'DARK',

            // data tile settings
            // ['power1s', 'power3s']
            powerZStack: 0,
            // ['heartRate', 'heartRateLap', 'heartRateAvg']
            heartRateZStack: 0,
            // ['cadence', 'cadenceLap', 'cadenceAvg', 'cadenceTarget']
            cadenceZStack: 0,
            // ['powerLap', 'powerAvg', 'kcal', 'virtualGear']
            kcalZStack: 0,
            // ['graph', 'power']
            graphZStack: 0,
        };
        return sources;
    }
}

/**
 * Base model for a rider-adjustable target. Subclasses choose limits, step size and parsing;
 * inc/dec move by one step through the same bounded setter.
 */
class Target extends Model {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 100);
        this.step = existance(args.step, 1);
    }
    defaultValue() { return 0; }
    defaultIsValid(value) {
        const self = this;
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
    /**
     * Reject nonnumeric input with the existing error path; otherwise parse and limit the requested
     * target to its configured range.
     */
    defaultSet(value) {
        const self = this;
        if(isNaN(value)) {
            self.onInvalid();
            return self.default;
        }
        return clamp(self.min, self.max, self.parse(value));
    }
    parse(value) { return parseInt(value); }
    inc(value) {
        const self = this;
        const x = value + self.step;
        return self.set(x);
    }
    dec(value) {
        const self = this;
        const x = value - self.step;
        return self.set(x);
    }
}

/**
 * Store the beep volume from 0 to 100. mute selects the minimum; the browser sound module
 * translates the value into loudness.
 */
class Volume extends Target {
    postInit(args = {}) {
        const self = this;
        const storageModel = {
            key: self.prop,
            fallback: self.defaultValue(),
            parse: parseInt,
        };
        self.min = existance(args.min, 0);
        self.max = existance(args.max, 100);
        self.step = existance(args.max, 10);
        self.storage = new args.storage(storageModel);
    }
    defaultValue() { return 0; }
    mute() {
        const self = this;
        return self.set(self.min);
    }
}

/**
 * Configure the requested trainer power in watts, distinct from the power actually reported by the
 * sensor.
 */
class PowerTarget extends Target {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 4000);
        this.step = existance(args.step, 10);
    }
}

/** Configure the trainer's requested resistance level; it is not a measured power value. */
class ResistanceTarget extends Target {
    postInit(args = {}) {
        this.min = existance(args.min, -100);
        this.max = existance(args.max, 100);
        this.step = existance(args.step, 10);
    }
    parse(value) { return parseInt(value); }
}

/**
 * Configure a road-grade target in percent, allowing decimal steps and negative values for
 * descents.
 */
class SlopeTarget extends Target {
    postInit(args = {}) {
        this.min = existance(args.min, -40);
        this.max = existance(args.max, 40);
        this.step = existance(args.step, 0.5);
    }
    defaultIsValid(value) {
        const self = this;
        return Number.isFloat(value) && inRange(self.min, self.max, value);
    }
    parse(value) { return parseFloat(value); }
}

/**
 * Configure a requested pedalling cadence in revolutions per minute; it remains separate from
 * measured cadence.
 */
class CadenceTarget extends Target {
    postInit(args = {}) {
        this.min = existance(args.min, 0);
        this.max = existance(args.max, 255);
        this.step = existance(args.step, 5);
    }
    parse(value) { return parseInt(value); }
}

/**
 * Restrict trainer mode to the shared ERG, resistance and simulation labels; ERG is the initial
 * mode.
 */
class Mode extends Model {
    postInit(args) {
        this.state = this.defaultValue();
        this.values = Object.values(ControlMode);
    }
    defaultValue() { return ControlMode.erg; }
    defaultIsValid(value) { return this.values.includes(value); }
}

/**
 * Keep the older ride engine's page labels. The platform navigation has additional routes and
 * translates to these where needed.
 */
class Page extends Model {
    postInit(args) {
        this.values = ['settings', 'home', 'workouts'];
    }
    defaultValue() { return 'home'; }
    defaultIsValid(value) { return this.values.includes(value); }
}

/**
 * Store functional threshold power, the reference in watts used to scale cycling workouts. The
 * initial value is a software default, not an assessment of the rider. Zone helpers label intensity
 * bands for displays.
 */
class FTP extends Model {
    postInit(args = {}) {
        const self = this;
        const storageModel = {
            key: self.prop,
            fallback: self.defaultValue(),
            parse: parseInt,
        };
        self.state       = self.default;
        self.min         = existance(args.min, 0);
        self.max         = existance(args.max, 1500);
        self.storage     = args.storage(storageModel);
        self.zones       = existance(args.zones, self.defaultZones());
        self.percentages = existance(args.percentages, self.defaultPercentages());
        self.minAbsValue = 9;
    }
    defaultValue() { return 200; }
    defaultIsValid(value) {
        const self = this;
        return Number.isInteger(value) && inRange(self.min, self.max, value);
    }
    defaultZones() {
        return ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
    }
    defaultPercentages() {
        return {'one': 0.54, 'two': 0.75, 'three': 0.87, 'four': 0.94, 'five': 1.05, 'six': 1.20};
    }
    /**
     * Convert values above the legacy threshold of 9 from watts to an FTP fraction. Smaller values
     * are assumed already relative.
     */
    toRelative(value, ftp) {
        const self = this;
        if(value > self.minAbsValue) return toFixed(value / ftp, 2);
        return value;
    }
    /**
     * Convert values below 9 from an FTP fraction to rounded watts, rounding the fraction to two
     * decimals first. Other values are treated as already absolute.
     */
    toAbsolute(value, ftp) {
        const self = this;
        if(value < self.minAbsValue) {
            const roundedUpValue = Math.round(value * 100) / 100; // round up to second position after decimal point
            const absolute = Math.round(roundedUpValue * (ftp ?? self.state));
            return absolute;
        }
        return value;
    }
    /**
     * Compare watts with configured fractions of FTP and return both the zone name and its
     * zero-based display index.
     */
    powerToZone(value, ftp, zones) {
        const self = this;
        if(!exists(ftp)) ftp = self.state;
        if(!exists(zones)) zones = self.zones;

        let index = 0;
        let name = zones[index];
        if(value < (ftp * self.percentages.one)) {
            index = 0;
            name = zones[index];
        } else if(value < (ftp * self.percentages.two)) {
            index = 1;
            name = zones[index];
        } else if(value < (ftp * self.percentages.three)) {
            index = 2;
            name = zones[index];
        } else if(value < (ftp * self.percentages.four)) {
            index = 3;
            name = zones[index];
        } else if(value < (ftp * self.percentages.five)) {
            index = 4;
            name = zones[index];
        } else if (value < (ftp * self.percentages.six)) {
            index = 5;
            name = zones[index];
        } else {
            index = 6;
            name = zones[index];
        }
        return {name, index};
    }
    zoneToColor(zone) {
        if(equals(zone, 'one'))   return '#636468';
        if(equals(zone, 'two'))   return '#328AFF';
        if(equals(zone, 'thee'))  return '#44A5AB';
        if(equals(zone, 'four'))  return '#57C057';
        if(equals(zone, 'five'))  return '#F8C73A';
        if(equals(zone, 'six'))   return '#FF663A';
        if(equals(zone, 'seven')) return '#FE340B';
        return '#636468';
    }
    /**
     * Choose an intensity-zone label directly from an FTP fraction, without first converting it to
     * watts.
     */
    percentageToZone(value) {
        const self = this;
        const zones = self.zones;
        if(value < (self.percentages.one)) {
            return zones[0];
        } else if(value < (self.percentages.two)) {
            return zones[1];
        } else if(value < (self.percentages.three)) {
            return zones[2];
        } else if(value < (self.percentages.four)) {
            return zones[3];
        } else if(value < (self.percentages.five)) {
            return zones[4];
        } else if (value < (self.percentages.six)) {
            return zones[5];
        } else {
            return zones[6];
        }
        return zones[0];
    }
}

/**
 * Store body mass in kilograms for settings and calculations; the default is a placeholder, not a
 * measured personal value.
 */
class Weight extends Model {
    postInit(args = {}) {
        const self = this;
        const storageModel = {
            key: self.prop,
            fallback: self.defaultValue(),
            parse: parseFloat,
        };
        self.min = existance(args.min, 0);
        self.max = existance(args.max, 500);
        self.storage = new args.storage(storageModel);
    }
    defaultValue() { return 75; }
    defaultIsValid(value) {
        const self = this;
        return Number.isFinite(value) && inRange(self.min, self.max, value);
    }
}

/**
 * Store and switch the legacy dark/light preference used by ride components. Invalid switch inputs
 * use the model's error/default path.
 */
class Theme extends Model {
    postInit(args = {}) {
        const self = this;
        const storageModel = {
            key: self.prop,
            fallback: self.defaultValue(),
        };
        self.storage = new args.storage(storageModel);
        self.values = ['dark', 'light'];
    }
    defaultValue() { return 'dark'; }
    defaultIsValid(value) { return this.values.includes(value); }
    switch(theme) {
        const self = this;
        if(equals(theme, first(self.values))) return second(self.values);
        if(equals(theme, second(self.values))) return first(self.values);
        self.onInvalid(theme);
        return self.default;
    }
}

/**
 * Support a compact 150-pixel-high desktop window at the bottom of the screen. Normal browser tabs
 * may ignore resizing, moving or closing requests.
 */
class DockMode extends Model {
    postInit(args = {}) {
        const self = this;
        const storageModel = {
            key: self.prop,
            fallback: self.defaultValue(),
            parse: (x) => x === 'true',
        };
        self.storage = new args.storage(storageModel);
        self.values = [true, false];
    }
    defaultValue() { return false; }
    switch(state) {
        return !state;
    }
    /**
     * Attempt compact sizing only when enabled and the current window is taller than the compact
     * mode.
     */
    apply(state) {
        const self = this;
        if(state && window.innerHeight > 200) {
            self.resize();
        }
    }
    /** Calculate compact-window width and bottom-of-screen position from the available display area. */
    calcSize() {
        const width = window.screen.availWidth;
        const height = 150;
        const top = window.screen.availHeight - height;
        return {width: width, height: height, top: top};
    }
    /** Ask the browser to resize and move the current window to the compact position. */
    resize() {
        const self = this;
        let {width, height, top} = self.calcSize();
        window.resizeTo(width, height);
        window.moveTo(0, top);
    }
    /**
     * Request a separate compact app window and ask to close this one; browser popup/window
     * policies still apply.
     */
    open() {
        const href = document.location.href;
        let self = this;
        let { width, height, top } = self.calcSize();

        window.open(`${href}`, '_blank', `noopener,width=${width},height=${height},left=0,top=${top}`);
        window.close();
    }
}

/**
 * Persist metric or imperial display preference. This changes presentation, not the stored physical
 * units.
 */
class Measurement extends Model {
    postInit(args = {}) {
        const self = this;
        const storageModel = {
            key: self.prop,
            fallback: self.defaultValue(),
        };
        self.storage = new args.storage(storageModel);
        self.values = ['metric', 'imperial'];
    }
    defaultValue() { return 'metric'; }
    defaultIsValid(value) { return this.values.includes(value); }
    switch(theme) {
        const self = this;
        if(equals(theme, first(self.values))) return second(self.values);
        if(equals(theme, second(self.values))) return first(self.values);
        self.onInvalid(theme);
        return self.default;
    }
}

/**
 * Persist which alternative ride-data tile is selected, converting the saved text back into a
 * numeric index.
 */
class DataTileSwitch extends Model {
    postInit(args = {}) {
        const self = this;
        const storageModel = {
            key: self.prop,
            fallback: self.defaultValue(),
        };
        self.storage = new args.storage(storageModel);
        this.values = [0, 1, 2];
    }
    defaultValue() { return 0; }
    defaultIsValid(value) { return this.values.includes(value); }
    defaultParse(value) {
        return parseInt(value);
    }
}

/**
 * Manage finished rides: binary FIT files, list summaries and the pending hand-off to the Coach.
 * Retain a small recent-file cache while protecting records still waiting for that hand-off.
 */
class Activity extends Model {
    // var activity = {
    //         id: UUID,
    //         blob: Blob,
    //         summary: {
    //             timestamp: Int,
    //             duration: Int,
    //             name: String,
    //             status: {
    //                 strava: String,
    //                 intervals: String,
    //                 trainingPeaks: String,
    //             }
    //         },
    // };

    name = 'activity';
    postInit(args) {
        this.api = args.api;
        this.capacity = 7;
    }
    defaultValue() { return []; }
    /**
     * Freeze the current ride into a FIT Blob, summary and Coach payload with one stable ID, then
     * save it. Keep the same pending record available if saving fails.
     */
    async createFromCurrent(db) {
        const id = uuid();
        const blob = fileHandler.toBlob(this.encode(db));
        const name = db.workout?.meta?.name ?? 'Powered by Athlima workout';
        const timestamp = Date.now();
        const ride = fromRecordedRide(db, id, timestamp);

        const summary = {
            id,
            timestamp,
            start: ride.start,
            name,
            duration: db.elapsed ?? 0,
            distance: ride.distance,
            averagePower: ride.averagePower,
            averageHeartRate: ride.averageHeartRate,
            averageCadence: ride.averageCadence,
            ftp: ride.ftp,
            powerProfile: summarizePowerProfile(ride.streams?.power),
            pendingSync: true,
            status: {strava: 'none', intervals: 'none', trainingPeaks: 'none'},
        };
        const record = {
            id,
            blob,
            summary,
            ride,
            coachingWorkoutId: db.workout?.coachingWorkoutId ?? null,
            pendingSync: true,
        };

        this.pendingRecording = record;
        return this.retrySave(db);
    }
    /**
     * Save the pending recording and clear its recovery checkpoint in one database transaction.
     * Only then clear the retry copy and announce the new activity.
     */
    async retrySave(db) {
        const record = this.pendingRecording;
        if(!record) throw new Error('No unsaved recording is available.');
        await idb.putManyChecked([['activity', record], ['session', {id: 0, elapsed: 0}]]);
        this.pendingRecording = null;
        const summary = record.summary;
        this.add(summary, db.activity);
        xf.dispatch('activity:add', summary);
        return record;
    }
    /**
     * Put a new summary first and remove older completed cache entries beyond capacity. Pending
     * Coach hand-offs are not discarded merely to meet the cache size.
     */
    add(activity, activityList) {
        activityList.unshift(activity);
        const completed = activityList.filter(item => !item.pendingSync);
        const capacity = Math.max(0, this.capacity - activityList.filter(item => item.pendingSync).length);
        for(const summary of completed.slice(capacity)) {
            activityList.splice(activityList.indexOf(summary), 1);
            idb.remove('activity', summary.id);
        }
        return activityList;
    }
    remove(id) {
        idb.remove('activity', id);
    }
    /**
     * Send a selected saved recording to the supported Intervals.icu integration, save its upload
     * status and announce the result to activity controls.
     */
    async upload(service, id) {
        let record = await idb.get('activity', id);

        if(service === 'intervals') {

            const res = await this.api[service].uploadWorkout(record);
            record = await idb.get('activity', id);
            record.summary.status[service] = res.substring(1);
            await idb.put('activity', record);

            xf.dispatch(`action:activity:${id}`, `:${service}:upload${res}`);
        }
        return;
    }
    /**
     * Read a saved FIT Blob and offer it as a timestamp-named browser download; this does not
     * delete the local recording.
     */
    async download(id) {
        const self = this;
        const record = await idb.get('activity', id);
        fileHandler.download()(
            record.blob,
            self.fileName(record.summary.timestamp),
            fileHandler.Type.OctetStream
        );
    }
    fileName(timestamp) {
        return `workout-${dateToDashString(new Date(timestamp))}.fit`;
    }
    /**
     * Pass recorded sensor samples, laps, events and FTP to the FIT writer, which constructs the
     * binary activity file.
     */
    encode(db) {
        const records = db.records;
        const laps = db.laps;
        const events = db.events;
        const ftp = db.ftp;

        return fit.localActivity.encode({
            records,
            laps,
            events,
            ftp,
        });
    }
    /**
     * Read local recording summaries newest first, adapt the old status format and recover richer
     * summary fields from saved ride payloads when present.
     */
    async restore() {
        const records = await idb.getAll('activity') ?? [];

        // migrate summary.status String to {strava: String, intervals: String}
        records.forEach((record) => {
            if(typeof record.summary.status === 'string') {
                console.log(`:activity :migrating `, record.id);
                record.summary.status = {strava: 'none', intervals: 'none'};
                idb.put('activity', record);
            }
        });

        return records
            .map((record) => ({
                ...record.summary,
                start: record.summary.start ?? record.ride?.start,
                distance: record.summary.distance ?? record.ride?.distance,
                averagePower: record.summary.averagePower ?? record.ride?.averagePower,
                averageHeartRate: record.summary.averageHeartRate ?? record.ride?.averageHeartRate,
                averageCadence: record.summary.averageCadence ?? record.ride?.averageCadence,
                ftp: record.summary.ftp ?? record.ride?.ftp,
                powerProfile: record.summary.powerProfile ??
                    summarizePowerProfile(record.ride?.streams?.power),
                pendingSync: record.pendingSync === true,
            }))
            .sort((a, b) => b.timestamp - a.timestamp);
    }
}

// TODO:
// - differentiate between Workout and Activity
// - this model should hold methods related to working on a Workout as memeber of the
//   workout list or as the current selected workout
// - Activity is about the current active recording, session, and the list of actities
//   which are just recorded data or .fit format, Workout is about .zwo format
/**
 * Handle a selected workout recipe or imported course, including conversion from a planned
 * Intervals.icu event. Some legacy download helpers also encode the current recording.
 */
class Workout extends Model {
    postInit(args = {}) {
        const self = this;
        self.api = args.api;
    }
    // state init
    defaultValue() { return this.parse((first(workoutsFile))); }
    defaultIsValid(value) {
        return exists(value);
    }
    restore(db) {
        return first(db.workouts);
    }
    // accessors
    /**
     * Find a workout by ID. This legacy lookup logs a missing ID and returns the first workout; it
     * does not prove that the requested one exists.
     */
    find(workouts, id) {
        for(let workout of workouts) {
            if(equals(workout.id, id)) {
                return workout;
            }
        }
        console.error(`tring to get a missing workout: ${id}`, workouts);
        return first(workouts);
    }
    // parsers
    /**
     * Interpret binary contents as a FIT course and text contents as a ZWO workout, returning the
     * ride engine's corresponding structure.
     */
    parse(result, name = '') {
        if(isArray(result) || isObject(result)) {
            const view = new DataView(result);
            const courseJS = fit.localCourse.decode(view, name);
            console.log(courseJS);
            return courseJS;
        }
        return zwo.readToInterval(result);
    }
    /**
     * Decode the provider's text-encoded workout file, attach its planned date and provider ID, and
     * give the local copy an ID.
     */
    fromIntervalsEvent(event) {
        const workout = this.parse(atob(event.workout_file_base64));
        workout.meta.planned = true;
        workout.meta.startDateLocal = event.start_date_local;
        workout.id = uuid();
        workout.intervals_id = event.id;
        return workout;
    }
    /** Convert each fetched provider event using the same planned-workout mapping. */
    fromIntervalsResponse(response) {
        return response.map(this.fromIntervalsEvent.bind(this));
    }
    /**
     * Read a user-selected file and retain its name alongside the contents so the parser can label
     * an imported course.
     */
    async readFromFile(file) {
        const result = await fileHandler.read(file);
        return {result, name: file.name};
    }
    /**
     * Legacy current-ride export path: encode the live records, laps and events as FIT, not as a
     * ZWO recipe.
     */
    encode(db) {
        const records = db.records;
        const laps = db.laps;
        const events = db.events;
        const ftp = db.ftp;

        return fit.localActivity.encode({
            records,
            laps,
            events,
            ftp,
        });
    }
    // utils
    fileName () {
        return `workout-${dateToDashString(new Date())}.fit`;
    }
    /**
     * Offer the live ride as a FIT download using the legacy export path; stored-recording
     * downloads use Activity instead.
     */
    download(db) {
        fileHandler.download()(this.encode(db), this.fileName(), fileHandler.Type.OctetStream);
    }
}

// TODO:
// - rename to Libarary
// - use to just manage the library list of workouts
/**
 * Manage the built-in and user-saved workout library. Built-in IDs use catalogue positions; saved
 * entries with the same ID replace their built-in counterpart when restored.
 */
class Workouts extends Model {
    name = 'workouts';

    init(args) {
        const self = this;
        self.workoutModel = args.workoutModel;
    }
    /**
     * Parse the bundled ZWO recipes and assign stable builtin-<index> IDs for this catalogue
     * ordering.
     */
    defaultValue() {
        const self = this;
        return workoutsFile.map((w, index) => Object.assign(self.workoutModel.parse(w), {id: `builtin-${index}`}));
    }
    defaultIsValid(value) {
        const self = this;
        return exists(value);
    }
    /** Combine stored workouts with built-ins, preferring a stored copy when their IDs match. */
    async restore(db) {
        const self = this;
        const workouts = await idb.getAll(`${self.name}`) ?? [];

        if(empty(workouts)) {
            return self.default;
        } else {
            const ids = new Set(workouts.map(workout => workout.id));
            return self.default.filter(workout => !ids.has(workout.id)).concat(workouts);
        }
    }
    /**
     * Find a library item by ID; the legacy fallback logs an error and returns the first item when
     * no match exists.
     */
    get(workouts, id) {
        for(let workout of workouts) {
            if(equals(workout.id, id)) {
                return workout;
            }
        }
        console.error(`tring to get a missing workout: ${id}`, workouts);
        return first(workouts);
    }
    /**
     * Assign an ID if needed, add the workout to the live list and request persistence. The
     * separate save method returns the checked-write Promise.
     */
    add(workouts, workout) {
        const self = this;
        workouts.push(idb.setId(workout));
        self.save(workout);
        return workouts;
    }
    /**
     * Persist a workout with a stable ID and return the checked-write Promise, allowing callers to
     * wait for confirmed saving.
     */
    save(workout) {
        const self = this;
        console.log(`:models :workouts :save`);
        return idb.putChecked(self.name, idb.setId(workout));
    }
    remove(workouts, id) {
        const self = this;
        if(!exists(id)) {
            console.error(`:models :workouts :remove 'called without workout id!'`);
            return workouts;
        }
        if(empty(workout)) {
            console.error(`:models :workouts :remove 'called with empty id!'`);
            return workouts;
        }
        idb.remove(self.name, id);
        return workouts.filter((w) => w.id !== id);
    }
}

function yesterdayOrOlder(timestamp) {
    return new Date().getDate() - new Date(timestamp).getDate() > 0;
}

// TODO:
// - standardize the methods
/**
 * Cache Intervals.icu's dated workout recipes in this browser. Simple accessors read the list or
 * its refresh timestamp; backup/restore persist the whole collection and notify the display.
 */
class Planned {
    name = 'planned';
    constructor(args = {}) {
        const self = this;
        this.data = this.defaultValue();
        this.workoutModel = args.workoutModel;
        this.api = args.api;
        this.athlete = {};
        this.storage = LocalStorageItem({
            key: 'planned',
            encode: JSON.stringify,
            parse: JSON.parse,
            fallback: this.defaultValue(),
        });
    }
    defaultValue() {
        return {workouts: [], modified: {}};
    }
    get(id) {
        for(let workout of this.data.workouts) {
            if(workout.id === id) {
                return workout;
            }
        }
        console.error(`tring to get a missing planned workout: ${id}`);
        return first(this.data.workouts);
    }
    setWorkouts(workouts) {
        this.data.workouts = workouts;
    }
    list() {
        return this.data.workouts;
    }
    setModified(service = 'intervals') {
        this.data.modified[service] = Date.now();
    }
    isEmpty() {
        return this.data.workouts.length === 0;
    }
    restore() {
        console.log(':planned :restore');

        this.data = this.storage.restore();

        console.log(`:planned :up-to-date`);
        xf.dispatch(`action:planned`, ':data');
    }
    backup() {
        this.storage.set(this.data);
        xf.dispatch(`action:planned`, ':data');
    }
    // force refresh the wod data
    /**
     * Legacy "workout of the day" refresh: fetch the current week, save its recipes and announce
     * today's first workout for selection.
     */
    async wod(service) {
        const self = this;
        if(service === 'intervals') {
            const { startOfWeek, endOfWeek } = getStartEndOfWeek(new Date(), true);
            const response = await api.intervals.wod(startOfWeek, endOfWeek);
            const workouts = self.workoutModel.fromIntervalsResponse(response);

            this.setWorkouts(workouts);
            this.setModified(service);
            this.backup();

            if(!this.isEmpty()) {
                for(let workout of this.data.workouts) {
                    if(isToday(workout.meta.startDateLocal)) {
                        const id = workout.id;
                        xf.dispatch(`action:li:${id}`, ':select');
                        break;
                    }
                }
            }
        }
    }
    /**
     * Refresh only the requested date range, retaining cached workouts outside it. Save the new
     * collection before exposing it to the UI.
     */
    async getIntervals(oldest, newest) {
        const response = await this.api.intervals.wod(oldest, newest);
        const workouts = this.workoutModel.fromIntervalsResponse(response);
        const retained = this.data.workouts.filter(workout => {
            const day = workout.meta.startDateLocal?.slice(0, 10);
            return !day || day < oldest || day > newest;
        });
        const next = {...this.data, workouts: [...retained, ...workouts]};
        this.storage.set(next);
        this.data = next;
        xf.dispatch('action:planned', ':data');
        return workouts;
    }
    /** Ask the Intervals.icu integration to refresh provider-managed FTP and body mass. */
    async getAthlete(service) {
        if(service === 'intervals') {
            await api.intervals.syncProfile();
        }
    }
}

/**
 * Keep an unfinished ride recoverable and collect its samples, lap summaries and start/stop events.
 * This data is separate from a finished Activity.
 */
function Session(args = {}) {
    let name = 'session';

    /**
     * Request a checkpoint under ID 0 using only the session fields selected by dbToSession. This
     * older path logs storage errors through the IDB helper.
     */
    function backup(db) {
        idb.put('session', idb.setId(dbToSession(db), 0));
    }

    /**
     * Read the last checkpoint and restore it only when it contains elapsed riding time; otherwise
     * clear empty recovery data.
     */
    async function restore(db) {
        const sessions = await idb.getAll(`${name}`);
        xf.dispatch(`${name}:restore`, sessions);
        console.log(`:idb :restore '${name}' :length ${sessions.length}`);

        let session = last(sessions);

        if(!empty(sessions)) {
            if(session.elapsed > 0) {
                sessionToDb(db, session);
            } else {
                idb.clear(`${name}`);
            }
        }
    }

    /**
     * Copy saved ride fields back into live state. Playback restoration later pauses the clock
     * rather than silently restarting it.
     */
    function sessionToDb(db, session) {
        return Object.assign(db, session);
    }

    /**
     * Select timing, recording, workout and display state needed to resume the ride, rather than
     * saving every transient app field.
     */
    function dbToSession(db) {
        const session = {
            // Watch
            elapsed: db.elapsed,
            lapTime: db.lapTime,
            stepTime: db.stepTime,
            intervalIndex: db.intervalIndex,
            stepIndex: db.stepIndex,
            intervalDuration: db.intervalDuration,
            stepDuration: db.stepDuration,
            lapStartTime: db.lapStartTime,
            watchStatus: db.watchStatus,
            workoutStatus: db.workoutStatus,

            // Course
            courseIndex: db.courseIndex,
            speedVirtual: db.speedVirtual,
            speed: db.speed,

            // Recording
            records: db.records,
            laps: db.laps,
            events: db.events,
            lap: db.lap,
            distance: db.distance,
            altitude: db.altitude,
            position_lat: db.position_lat,
            position_long: db.position_long,

            // Avg State
            kcal: db.kcal,
            powerLap: db.powerLap,
            cadenceLap: db.cadenceLap,
            heartRateLap: db.heartRateLap,
            powerAvg: db.powerAvg,
            cadenceAvg: db.cadenceAvg,
            heartRateAvg: db.heartRateAvg,
            powerLapCount: db.powerLapCount,
            cadenceLapCount: db.cadenceLapCount,
            heartRateLapCount: db.heartRateLapCount,
            powerAvgCount: db.powerAvgCount,
            cadenceAvgCount: db.cadenceAvgCount,
            heartRateAvgCount: db.heartRateAvgCount,

            // Report
            powerInZone: db.powerInZone,

            // Workouts
            workout: db.workout,
            mode: db.mode,
            lock: db.lock,
            page: db.page,

            // Targets
            powerTarget: db.powerTarget,
            resistanceTarget: db.resistanceTarget,
            slopeTarget: db.slopeTarget,

            // sources: db.sources,

            // UI options
            powerSmoothing: db.powerSmoothing,
        };

        return session;
    }

    /**
     * Clear the finished/discarded ride's samples, counters and targets while retaining the rider's
     * persistent settings and workout library.
     */
    function reset(db) {
        db.records = [];
        db.lap = [];
        db.laps = [];
        db.events = [];
        db.lapStartTime = false;
        db.rrInterval = [];

        db.elapsed = 0;
        db.lapTime = 0;
        db.stepTime = 0;
        db.intervalIndex = 0;
        db.stepIndex = 0;
        db.intervalDuration = 0;
        db.stepDuration = 0;

        db.resistanceTarget = 0;
        db.slopeTarget = 0;
        db.powerTarget = 0;
        db.position_lat = 0;
        db.position_long = 0;
        db.altitude = virtualState.altitude;
        db.distance = virtualState.distance;
        db.ascent = virtualState.ascent;
        db.powerLap = powerLap.default;
        db.heartRateLap = heartRateLap.default;
        db.cadenceLap = cadenceLap.default;
        db.kcal = kcal.default;
        db.powerAvg = powerAvg.default;
        db.cadenceAvg = cadenceAvg.default;
        db.heartRateAvg = heartRateAvg.default;
        db.powerLapCount = powerLap.count;
        db.heartRateLapCount = heartRateLap.count;
        db.cadenceLapCount = cadenceLap.count;
        db.powerAvgCount = powerAvg.count;
        db.cadenceAvgCount = cadenceAvg.count;
        db.heartRateAvgCount = heartRateAvg.count;
    }

    /**
     * Append a sensor snapshot when the running clock advances, including validity flags for
     * disconnected sensors. Add RR data when available and request a recovery checkpoint every 60
     * elapsed seconds.
     */
    function elapsed(x, db) {
        if(equals(db.watchStatus, TimerStatus.stopped)) {
            db.elapsed   = x;
            return;
        };

        db.elapsed = x;

        const speed = equals(db.sources.virtualState, 'speed') ?
                    db.speed :
                    db.speedVirtual;

        const record = {
            timestamp:  Date.now(),
            power:      db.power1s,
            cadence:    db.cadence,
            speed:      speed,
            heart_rate: db.heartRate,
            powerValid: db.connectedDevices ? db.connectedDevices[db.sources.power] === true : undefined,
            heartRateValid: db.connectedDevices ? db.connectedDevices[db.sources.heartRate] === true : undefined,
            distance:   db.distance,
            grade:      db.slopeTarget,
            altitude:   db.altitude,
            position_lat:                 db.position_lat,
            position_long:                db.position_long,
            saturated_hemoglobin_percent: db.smo2,
            total_hemoglobin_conc:        db.thb,
            core_temperature:             db.coreBodyTemperature,
            skin_temperature:             db.skinTemperature,
            device_index:                 0,
        };

        db.records.push(record);
        if(!empty(db.rrInterval)) {
            db.records.push({time: pad(db.rrInterval, 5, 0xFFFF)});
        }

        db.lap.push(record);

        if(equals(db.elapsed % 60, 0)) {
            // models.session.backup(db);
            backup(db);
            console.log(`backing up of ${db.records.length} records ...`);
        }
    }

    /**
     * Finish the current lap with its duration and measurement summaries, then begin a fresh lap
     * collection.
     */
    function lap(x, db) {
        let timeEnd   = Date.now();
        let timeStart = db.lapStartTime;
        let elapsed   = timeDiff(timeStart, timeEnd);

        if(elapsed > 0) {
            const lap = {
                timestamp:        timeEnd,
                start_time:       timeStart,
                totalElapsedTime: elapsed,
                avgPower:         db.powerLap,
                maxPower:         max(db.lap, 'power'),
                avgCadence:       Math.round(avg(db.lap, 'cadence')),
                avgHeartRate:     Math.round(avg(db.lap, 'heart_rate')),
                saturated_hemoglobin_percent: toFixed(avg(db.lap, 'saturated_hemoglobin_percent'), 2),
                total_hemoglobin_conc: toFixed(avg(db.lap, 'total_hemoglobin_conc'), 2),
                core_temperature: toFixed(avg(db.lap, 'core_temperature'), 2),
                skin_temperature: toFixed(avg(db.lap, 'skin_temperature'), 2)
            };

            db.laps.push(lap);
            db.lap = [];
        }
        db.lapStartTime = timeEnd + 0;
    }

    /**
     * Append start/stop events but suppress consecutive duplicates of the same type, keeping the
     * FIT event history meaningful.
     */
    function event(x, db) {
        if(!empty(db.events) && equals(last(db.events).type, x.type)) return;
        db.events.push(x);
    }

    return Object.freeze({
        backup,
        restore,
        reset,
        sessionToDb,
        dbToSession,

        elapsed,
        lap,
        event,
    });
}

/**
 * Base for derived live measurements. Construction sets defaults and starts subscriptions;
 * start/stop and subs/unsubs attach/remove listeners. Hooks such as format and shouldUpdate let
 * subclasses customize calculations without duplicating the lifecycle.
 */
class MetaProp {
    constructor(args = {}) {
        const self = this;
        this.init(args);
        this.prop     = args.prop ?? this.getDefaults().prop;
        this.disabled = args.default ?? this.getDefaults().disabled;
        this.default  = args.default ?? this.getDefaults().default;
        this.state    = args.state ?? this.default;
        this.name     = args.name ?? `meta-prop`;
        this.propName = self.toCamelCase(args.name) ?? `metaProp`;
        this.postInit(args);
        this.start();
    }
    init(args) {
        return args;
    }
    postInit(args = {}) {
        return args;
    }
    getPropValue(propValue) {
        return propValue;
    }
    getState() {
        return this.format(this.state);
    }
    setState(propValue) {
        return this.updateState(propValue);
    }
    format(state) {
        return state;
    }
    start() {
        this.subs();
    }
    stop() {
        this.unsubs();
    }
    toCamelCase(str) {
        if(exists(str)) {
            return str.replace(/-([a-z])/g, function (g) {
                return g[1].toUpperCase();
            });
        }
        return str;
    }
    /**
     * Create one cancellation signal for this model's listeners, then let the subclass declare
     * which messages it needs.
     */
    subs() {
        const self = this;
        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };
        this.subsConfig();
    }
    subsConfig() { return; }
    unsubs() {
        this.abortController.abort();
    }
    /** Apply a received value only when the subclass's update condition allows it. */
    onUpdate(propValue) {
        if(this.shouldUpdate(propValue)) {
            this.updateState(propValue);
        }
    }
    shouldUpdate() {
        return true;
    }
    updateState(value) {
        this.state = value;
        return this.state;
    }
}

/**
 * Maintain an incremental ride or lap average without storing every sample. This legacy accumulator
 * ignores zero readings after a nonzero value, so it is not an average including coasting.
 */
class PropAccumulator extends MetaProp {
    postInit(args = {}) {
        this.event = args.event ?? this.getDefaults().event;
        this.count = this.getDefaults().count;
        this.prev  = this.getDefaults().prev;
    }
    getDefaults() {
        return {
            value: 0,
            prev: 0,
            default: 0,
            disabled: false,
            prop: '',

            event: '',
            prev: 0,
            count: 0,
        };
    }
    format(state) {
        return Math.round(state);
    }
    reset() { this.count = 0; }
    /** Follow a measurement message and, when configured, a reset event such as a lap boundary. */
    subsConfig() {
        if(!equals(this.prop, '')) {
            xf.sub(`${this.prop}`, this.onUpdate.bind(this), this.signal);
        }
        if(!equals(this.event, '')) {
            xf.sub(`${this.event}`, this.onEvent.bind(this), this.signal);
        }
    }
    /**
     * Update sample count and running average for accepted nonzero samples, retaining the prior
     * average on a later zero.
     */
    updateState(value) {
        if(this.state === 0 && value === 0) {
            this.state = 0;
        } else if(value === 0) {
            return this.state;
        } else {
            this.count += 1;
            const value_c = value;
            const value_p = this.prev;
            const count_c = this.count;
            const count_p = this.count-1;
            this.state = mavg(value_c, value_p, count_c, count_p);
            this.prev = this.state;

        }
        return this.state;
    }
    onEvent() {
        this.reset();
    }
    /**
     * Restore both the average and its sample count so the next sample continues the previous
     * calculation.
     */
    restore(db) {
        this.count = db[this.propName+"Count"] ?? this.count;
        this.state = db[this.propName] ?? this.state;
        this.prev = db[this.propName] ?? this.prev;
    }
}

/**
 * Accumulate power multiplied by 0.001 per one-second update. That is numerically work in
 * kilojoules; the legacy kcal label is an approximate energy display, not measured calorie
 * expenditure.
 */
class KcalAccumulator extends PropAccumulator {
    updateState(power) {
        this.state = this.state + power * 0.001;
        return this.state;
    }
}

const powerLap = new PropAccumulator({
    event: 'watch:lap',
    name: 'power-lap',
});
const powerAvg = new PropAccumulator({
    event: 'watch:stopped',
    name: 'power-avg',
});
const kcal = new KcalAccumulator({
    event: 'watch:stopped',
    name: 'kcal',
});

const cadenceLap = new PropAccumulator({
    event: 'watch:lap',
    name: 'cadence-lap',
});
const cadenceAvg = new PropAccumulator({
    event: 'watch:stopped',
    name: 'cadence-avg',
});

const heartRateLap = new PropAccumulator({
    event: 'watch:lap',
    name: 'heart-rate-lap',
});
const heartRateAvg = new PropAccumulator({
    event: 'watch:stopped',
    name: 'heart-rate-avg',
});



/**
 * Collect incoming readings over a fixed time window, then publish their average. Used for the
 * one-second and three-second power displays; interval is in milliseconds.
 */
class PropInterval {
    constructor(args = {}) {
        const self = this;
        this.default     = existance(args.default, this.getDefaults().default);
        this.state       = existance(args.state, this.getDefaults().default);
        this.accumulator = existance(args.accumulator, this.getDefaults().accumulator);
        this.count       = existance(args.count, this.getDefaults().count);
        this.prop        = existance(args.prop, this.getDefaults().prop);
        this.effect      = existance(args.effect, this.getDefaults().effect);
        this.interval    = existance(args.interval, this.getDefaults().interval);
        this.start();
    }
    getDefaults() {
        const self = this;
        return {
            default: 0,
            accumulator: 0,
            count: 0,
            interval: 1000,
            prop: '',
            effect: '',
        };
    }
    /**
     * Subscribe to readings and start the averaging timer. stop cancels both; reset clears only the
     * current window's samples.
     */
    start() {
        this.subs();
        this.intervalId = setInterval(this.onInterval.bind(this), this.interval);
    }
    stop() {
        clearInterval(this.intervalId);
        this.unsubs();
    }
    reset() {
        this.accumulator = 0;
        this.count = 0;
    }
    subs() {
        const self = this;
        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };

        xf.sub(`${this.prop}`, this.onUpdate.bind(this), this.signal);
    }
    unsubs() {
        this.abortController.abort();
    }
    /** Add a reading to the current window and count it, including zero values. */
    onUpdate(propValue) {
        this.accumulator += propValue;
        this.count += 1;
    }
    /**
     * Publish the average only when readings arrived in this window, then empty the window for the
     * next period.
     */
    onInterval() {
        if(equals(this.count, 0)) return;

        this.state = this.accumulator / this.count;
        xf.dispatch(`${this.effect}`, this.state);
        this.reset();
    }
}

/**
 * Track counts and shares of nonzero power samples in FTP display zones. It reacts to elapsed-time
 * messages; zero readings do not add zone time in this legacy display calculation.
 */
class PowerInZone {
    constructor(args = {}) {
        const self = this;
        this.ftpModel = existance(args.ftpModel);
        this.default  = existance(args.default, this.getDefaults().default);
        this.count    = existance(args.count,   this.getDefaults().count);
        this.weights  = existance(args.weights, this.getDefaults().weights);
        this.state    = existance(args.state,   this.getDefaults().default);
        this.prop     = existance(args.prop,    this.getDefaults().prop);
        this.start();
    }
    getDefaults() {
        const self = this;
        const value = self.ftpModel.zones.map(x => [0,0]);
        const weights = self.ftpModel.zones.map(x => 0);

        return {
            default: value,
            weights: weights,
            count: 0,
            prop: 'db:elapsed',
        };
    }
    start() {
        this.subs();
    }
    stop() {
        this.unsubs();
    }
    subs() {
        const self = this;
        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };

        xf.reg(`${this.prop}`, this.onUpdate.bind(this), this.signal);
    }
    unsubs() {
        this.abortController.abort();
    }
    onUpdate(propValue, db) {
        this.updateState(db.power);
    }
    powerToZone(power) {
        return this.ftpModel.powerToZone(power);
    }
    /**
     * Classify a nonzero sample, update its zone count and recompute all observed shares before
     * announcing the chart data.
     */
    updateState(value) {
        if(equals(value, 0)) return this.state;

        const zone = this.powerToZone(value);

        this.count += 1;
        this.weights[zone.index] += 1;

        for(let i=0; i < this.state.length; i++) {
            if(!equals(this.weights[i], 0)) {
                this.state[i] = [this.weights[i] / this.count, this.weights[i]];
            }
        }

        xf.dispatch('powerInZone', this.state);
        return this.state;
    }
}

/**
 * Use the cycling physics model to estimate movement from power. It follows the selected speed
 * source and updates distance, altitude and ascent through app messages.
 */
class VirtualState extends MetaProp {
    postInit() {
        this.speed           = this.getDefaults().speed;
        this.altitude        = this.getDefaults().altitude;
        this.distance        = this.getDefaults().distance;
        this.ascent          = this.getDefaults().ascent;

        this.slope           = this.getDefaults().slope;
        this.riderWeight     = this.getDefaults().riderWeight;
        this.equipmentWeight = this.getDefaults().equipmentWeight;
        this.mass            = this.getDefaults().mass;

        this.source          = this.getDefaults().source;
        this.cycling         = Cycling({
            rho:             1.275,
            dragCoefficient: 0.88,   // 1.0, 0.88
            frontalArea:     0.36,   // 0.4, 0.36
            CdA:             0.3168, // 0.4, 0.3168
        });
        this.lastUpdate      = undefined;
    }
    getDefaults() {
        return {
            riderWeight: 75,
            equipmentWeight: 10,
            mass: 85,
            slope: 0.00,

            speed: 0,
            altitude: 0,
            distance: 0,
            ascent: 0,

            prop: 'power',
            source: 'power',
            disabled: false,
            default: 0,
        };
    }
    subs() {
        xf.reg(`${this.prop}`,  this.onUpdate.bind(this), this.signal);
        xf.sub(`db:sources`,    this.onSources.bind(this), this.signal);
        xf.sub(`db:weight`,     this.onWeight.bind(this), this.signal);
        xf.sub('watch:started', this.onStarted.bind(this), this.signal);
    }
    /**
     * Switch between power-derived and trainer-speed movement, restarting the timing reference when
     * the source changes.
     */
    onSources(sources) {
        if(!equals(this.source, sources.virtualState)) {
            this.lastUpdate = Date.now();
        }

        this.source = sources.virtualState;
    }
    onWeight(weight) {
        this.riderWeight = weight;
        this.systemWeight = this.riderWeight + this.equipmentWeight;
    }
    /** Reset the last-update timestamp so time spent paused is not treated as riding time. */
    onStarted() {
        this.lastUpdate = Date.now();
    }
    /**
     * When power is the selected source, calculate motion since the last reading and announce the
     * resulting speed and route distances. Convert the slope target from percent to a fraction.
     */
    onUpdate(power, db) {
        if(!equals(this.source, this.prop)) return;

        // Take into acount the pauses
        const now = Date.now();
        const dt  = (now - this.lastUpdate) / 1000;
        this.lastUpdate = now;

        if(equals(dt, 0)) {
            // console.warn(`dt: ${dt}, s: ${this.speed}`);
            return;
        };

        const { speed, distance, altitude, ascent } = this.cycling.virtualSpeedCF({
            power:    db.power,
            slope:    db.slopeTarget / 100,
            distance: db.distance,
            altitude: db.altitude,
            ascent:   db.ascent,
            mass:     this.mass,
            speed:    this.speed,
            dt:       isNaN(dt) ? 1/4 : dt,
        });

        this.speed = speed;

        // xf.dispatch('speedVirtual', (speed * 3.6));
        xf.dispatch('speedVirtual', speed);
        xf.dispatch('distance', distance);
        xf.dispatch('altitude', altitude);
        xf.dispatch('ascent', ascent);
    }
}

/**
 * Alternative movement model that uses trainer-reported speed instead of estimating speed from
 * power, while retaining the same distance/climbing outputs.
 */
class SpeedState extends VirtualState {
    getDefaults() {
        return {
            prop: 'speed',
            source: 'power',
            disabled: false,
            default: 0,

            riderWeight: 75,
            equipmentWeight: 10,
            mass: 85,
            slope: 0.00,

            speed: 0,
            altitude: 0,
            distance: 0,
        };
    }
    /**
     * Advance distance and climbing from the selected trainer-speed reading and elapsed time,
     * remembering the previous speed for acceleration.
     */
    onUpdate(speed, db) {
        if(!equals(this.source, this.prop)) return;

        const now = Date.now();
        const dt  = (now - this.lastUpdate) / 1000;
        this.lastUpdate = now;

        const { distance, altitude, ascent } = this.cycling.trainerSpeed({
            slope:     db.slopeTarget / 100,
            // speed:     db.speed / 3.6,
            speed:     db.speed,
            distance:  db.distance,
            altitude:  db.altitude,
            ascent:    db.ascent,
            speedPrev: this.speedPrev,
            mass:      this.mass,
            dt:        isNaN(dt) ? 1/4 : dt,
        });

        // this.speedPrev = speed / 3.6;
        this.speedPrev = speed;

        xf.dispatch('distance', distance);
        xf.dispatch('altitude', altitude);
        xf.dispatch('ascent', ascent);
    }
}

// 0 means no gear report has arrived yet.
// A real gear is 1 through 254. The protocol's highest set byte is 0xFF,
// and that byte decodes to gear 254.
/**
 * Track virtual gear-button reports. Zero means no gear report yet; real gears are bounded from 1
 * to 254. This is a software gear display, not detection of a physical chain position.
 */
class VirtualGear extends Model {
    postInit(args = {}) {
        this.min = existance(args.min, 1);
        this.max = existance(args.max, 254);
    }
    defaultValue() { return 0; }
    /**
     * Apply a batch of button/value messages in order, preserving the current gear for unrecognized
     * messages.
     */
    apply(gear, messages = []) {
        const list = isArray(messages) ? messages : [];
        let next = gear;

        for(let i = 0; i < list.length; i++) {
            next = this.applyOne(next, list[i]);
        }

        return next;
    }
    /**
     * React only to pressed shift buttons or a valid absolute gear report. Clamp valid shifts to
     * the supported range and preserve the unknown state on an initial downshift.
     */
    applyOne(gear, message) {
        if(!message) return gear;

        if(equals(message.action, 'shiftUp') && equals(message.state, 'pressed')) {
            if(gear < this.min) return this.min;
            return clamp(this.min, this.max, gear + 1);
        }

        if(equals(message.action, 'shiftDown') && equals(message.state, 'pressed')) {
            if(gear <= this.min) return gear;
            return gear - 1;
        }

        if(equals(message.action, 'gearSet') && equals(message.state, 'value') && Number.isFinite(message.value)) {
            return clamp(this.min, this.max, message.value);
        }

        return gear;
    }
}

/**
 * Unimplemented historical formula note, not a live calculator. The active Coach load calculation
 * is in coaching/power.js and coaching/workouts.js.
 */
class TSS {
    // TSS = (t * NP * IF) / (FTP * 3600) * 100
    // NP:
    // 1. Calculate a rolling 30-second average power for the workout or
    //    specific section of data
    // 2. Raise the resulting values to the fourth power.
    // 3. Determine the average of these values.
    // 4. Find the fourth root of the resulting average.
    // IF = NP / FTP
}


const api = API();

const power = new Power({prop: 'power'});
const cadence = new Cadence({prop: 'cadence'});
const heartRate = new HeartRate({prop: 'heartRate'});
const speed = new Speed({prop: 'speed'});
const smo2 = new SmO2({prop: 'smo2'});
const thb = new THb({prop: 'thb'});
const sources = new Sources({prop: 'sources', storage: LocalStorageItem});

const virtualState = new VirtualState();
const speedState   = new SpeedState();

const powerTarget = new PowerTarget({prop: 'powerTarget'});
const resistanceTarget = new ResistanceTarget({prop: 'resistanceTarget'});
const slopeTarget = new SlopeTarget({prop: 'slopeTarget'});
const cadenceTarget = new CadenceTarget({prop: 'cadenceTarget'});
const mode = new Mode({prop: 'mode'});
const page = new Page({prop: 'page'});

const ftp = new FTP({prop: 'ftp', storage: LocalStorageItem});
const weight = new Weight({prop: 'weight', storage: LocalStorageItem});
const theme = new Theme({prop: 'theme', storage: LocalStorageItem});
const dockMode = new DockMode({prop: 'dockMode', storage: LocalStorageItem});
const volume = new Volume({prop: 'volume', storage: LocalStorageItem});
const measurement = new Measurement({prop: 'measurement', storage: LocalStorageItem});
const dataTileSwitch = new DataTileSwitch({prop: 'dataTileSwitch', storage: LocalStorageItem});

const virtualGear = new VirtualGear({prop: 'virtualGear'});

const power1s = new PropInterval({prop: 'db:power', effect: 'power1s', interval: 1000});
const power3s = new PropInterval({prop: 'db:power', effect: 'power3s', interval: 3000});
const powerInZone = new PowerInZone({ftpModel: ftp});

const activity = new Activity({prop: 'activity', api: api});
const workout = new Workout({prop: 'workout', api: api});
const workouts = new Workouts({prop: 'workouts', workoutModel: workout});
const planned = new Planned({prop: 'planned', workoutModel: workout, api: api});

const session = Session();

let models = {
    power,
    heartRate,
    cadence,
    speed,
    smo2,
    thb,
    sources,

    virtualState,

    power1s,
    power3s,
    powerLap,
    powerAvg,
    powerInZone,
    kcal,
    virtualGear,

    heartRateLap,
    heartRateAvg,

    cadenceLap,
    cadenceAvg,

    powerTarget,
    resistanceTarget,
    slopeTarget,
    cadenceTarget,

    mode,
    page,
    ftp,
    weight,
    dockMode,
    volume,
    theme,
    measurement,
    dataTileSwitch,

    activity,
    workout,
    workouts,
    planned,
    session,

    PropInterval,

    api,
};

export { models };
