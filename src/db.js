/**
 * Connects live ride data, button actions, models and browser storage. Despite the name, db here is
 * the in-memory state of the open page, not an online database. xf.reg handlers update that state;
 * top-level updates notify screens through db:<field> events. Persistence is explicit in
 * model/storage calls, so changing a live reading alone does not save it.
 */

import { xf, exists, equals } from './functions.js';
import { models } from './models/models.js';
import { Sound } from './sound.js';
import { idb } from './storage/idb.js';
import { ControlMode, } from './ble/enums.js';
import { TimerStatus, } from './activity/enums.js';
import { coachingService, initializeCoaching } from './coaching/service.js';
import { localDay } from './coaching/domain.js';
import { toAppWorkout } from './coaching/workouts.js';
import { accountDatabase } from './storage/account.js';
import intervals from './models/intervals.js';
import { syncRecordedRides } from './storage/ride-sync.js';

// import { trainerMock } from './simulation-scripts.js';

let db = {
    // Data Screen
    power: models.power.default,
    heartRate: models.heartRate.default,
    rrInterval: [],
    cadence: models.cadence.default,
    speed: models.speed.default,
    sources: models.sources.default,
    connectedDevices: {},
    smo2: models.smo2.default,
    thb: models.thb.default,
    coreBodyTemperature: 0,
    skinTemperature: 0,
    position_lat: 0,
    position_long: 0,

    speedVirtual: models.virtualState.speed,
    altitude: models.virtualState.altitude,
    distance: models.virtualState.distance,
    ascent: models.virtualState.ascent,

    power1s: models.power1s.default,
    power3s: models.power3s.default,
    powerInZone: models.powerInZone.default,

    powerLap: models.powerLap.default,
    heartRateLap: models.heartRateLap.default,
    cadenceLap: models.cadenceLap.default,
    kcal: models.kcal.default,
    powerAvg: models.powerAvg.default,
    virtualGear: models.virtualGear.default,
    cadenceAvg: models.cadenceAvg.default,
    heartRateAvg: models.heartRateAvg.default,

    powerLapCount: models.powerLap.count,
    heartRateLapCount: models.heartRateLap.count,
    cadenceLapCount: models.cadenceLap.count,
    powerAvgCount: models.powerAvg.count,
    cadenceAvgCount: models.cadenceAvg.count,
    heartRateAvgCount: models.heartRateAvg.count,

    heartRateMax: 0,

    // Targets
    powerTarget: models.powerTarget.default,
    resistanceTarget: models.resistanceTarget.default,
    slopeTarget: models.slopeTarget.default,
    cadenceTarget: models.cadenceTarget.default,

    mode: models.mode.default,
    page: models.page.default,
    lock: false,

    // Profile
    ftp: models.ftp.default,
    weight: models.weight.default,
    theme: models.theme.default,
    dockMode: models.dockMode.default,
    measurement: models.measurement.default,
    volume: models.volume.default,

    // UI options
    powerSmoothing: 0,
    dataTileSwitch: models.dataTileSwitch.default,

    // Workouts
    workouts: [],
    workout: models.workout.default,
    workoutTextEvent: "",

    // Activities
    activity: models.activity.default,

    // Recording
    records: [],
    lap: [],
    laps: [],
    events: [],
    lapStartTime: false,

    // Watch
    elapsed: 0,
    lapTime: 0,
    stepTime: 0,
    intervalIndex: 0,
    stepIndex: 0,
    intervalDuration: 0,
    stepDuration: 0,
    watchStatus: TimerStatus.stopped,
    workoutStatus: TimerStatus.stopped,

    // Course
    courseIndex: 0,

    // Request ANT+ Device
    antSearchList: [],
    antDeviceId: {},

    // Services
    services: {strava: false, intervals: false, trainingPeaks: false},
};



xf.create(db);

for(const source of ['ble:controllable', 'ble:powerMeter', 'ble:speedCadenceSensor',
    'ble:heartRateMonitor', 'ant:controllable', 'ant:hrm']) {
    xf.reg(`${source}:connected`, (_, state) => { state.connectedDevices[source] = true; });
    xf.reg(`${source}:disconnected`, (_, state) => { state.connectedDevices[source] = false; });
}

// Data Screen
xf.reg(models.heartRate.prop, (heartRate, db) => {
    db.heartRate = heartRate;
    db.heartRateLap = models.heartRateLap.setState(heartRate);
    db.heartRateAvg = models.heartRateAvg.setState(heartRate);
    db.heartRateLapCount = models.heartRateLap.count;
    db.heartRateAvgCount = models.heartRateAvg.count;

    if(heartRate > db.heartRateMax) {
        db.heartRateMax = heartRate;
    }
});

xf.reg('rrInterval', (rrInterval, db) => {
    db.rrInterval = rrInterval;
});

xf.reg(models.power.prop, (power, db) => {
    db.power = power;
});

xf.reg(models.cadence.prop, (cadence, db) => {
    db.cadence = cadence;
    db.cadenceLap = models.cadenceLap.setState(cadence);
    db.cadenceAvg = models.cadenceAvg.setState(cadence);
    db.cadenceLapCount = models.cadenceLap.count;
    db.cadenceAvgCount = models.cadenceAvg.count;
});

xf.reg(models.speed.prop, (speed, db) => {
    db.speed = speed;
});

xf.reg(models.smo2.prop, (smo2, db) => {
    db.smo2 = smo2;
});

xf.reg(models.thb.prop, (thb, db) => {
    db.thb = thb;
});

xf.reg(`coreBodyTemperature`, (coreBodyTemperature, db) => {
    db.coreBodyTemperature = coreBodyTemperature;
});

xf.reg(`skinTemperature`, (skinTemperature, db) => {
    db.skinTemperature = skinTemperature;
});

xf.reg('ble:openBikeControl:buttonState', (messages, db) => {
    db.virtualGear = models.virtualGear.apply(db.virtualGear, messages);
});

xf.reg(models.sources.prop, (sources, db) => {
    db.sources = models.sources.set(db.sources, sources);
    models.sources.backup(db.sources);
    console.log(db.sources);
});

xf.reg(models.dockMode.prop, (value, db) => {
    db.dockMode = models.dockMode.set(value);
    models.dockMode.backup(db.dockMode);
});

xf.reg('power1s', (power, db) => {
    db.power1s = power;

    db.powerLap = models.powerLap.setState(power);
    db.powerAvg = models.powerAvg.setState(power);
    db.kcal = models.kcal.setState(power);

    db.powerLapCount = models.powerLap.count;
    db.powerAvgCount = models.powerAvg.count;
});

xf.reg('power3s', (power, db) => {
    db.power3s = power;
});

xf.reg('powerInZone', (powerInZone, db) => {
    db.powerInZone = powerInZone;
});

xf.reg('speedVirtual', (speedVirtual, db) => {
    db.speedVirtual = speedVirtual;
});

xf.reg('altitude', (altitude, db) => {
    db.altitude = altitude;
});

xf.reg('ascent', (ascent, db) => {
    db.ascent = ascent;
});

xf.reg('distance', (distance, db) => {
    if(equals(db.watchStatus, 'started')) {
        db.distance = distance;
    };
});

// Pages
xf.reg('ui:page-set', (page, db) => {
    db.page = models.page.set(page);
});

// Modes
/**
 * Switch trainer-control mode only when controls are unlocked, then resend the matching power,
 * resistance or slope target.
 */
xf.reg('ui:mode-set', (mode, db) => {
    if(db.lock) return;

    db.mode = models.mode.set(mode);

    if(equals(mode, ControlMode.erg)) {
        xf.dispatch(`ui:power-target-set`, db.powerTarget);
    }
    if(equals(mode, ControlMode.resistance)) {
        xf.dispatch(`ui:resistance-target-set`, db.resistanceTarget);
    }
    if(equals(mode, ControlMode.sim)) {
        xf.dispatch(`ui:slope-target-set`, db.slopeTarget);
    }
});

xf.reg('ui:lock-set', (_, db) => {
    db.lock = !db.lock;
});

xf.reg('ui:lock-toggle', (_, db) => {
    db.lock = !db.lock;
});


// UI options
xf.reg('ui:data-tile-switch-set', (index, db) => {
    db.dataTileSwitch = index;
    models.dataTileSwitch.backup(db.dataTileSwitch);
});

// Targets
xf.reg('ui:power-target-set', (powerTarget, db) => {
    db.powerTarget = models.powerTarget.set(powerTarget);
});
xf.reg('ui:power-target-inc', (_, db) => {
    db.powerTarget = models.powerTarget.inc(db.powerTarget);
});
xf.reg(`ui:power-target-dec`, (_, db) => {
    db.powerTarget = models.powerTarget.dec(db.powerTarget);
});
xf.reg('ui:cadence-target-set', (cadenceTarget, db) => {
    db.cadenceTarget = models.cadenceTarget.set(cadenceTarget);
});

xf.reg('ui:resistance-target-set', (resistanceTarget, db) => {
    db.resistanceTarget = models.resistanceTarget.set(resistanceTarget);
});
xf.reg('ui:resistance-target-inc', (_, db) => {
    db.resistanceTarget = models.resistanceTarget.inc(db.resistanceTarget);
});
xf.reg(`ui:resistance-target-dec`, (_, db) => {
    db.resistanceTarget = models.resistanceTarget.dec(db.resistanceTarget);
});

xf.reg('ui:slope-target-set', (slopeTarget, db) => {
    db.slopeTarget = models.slopeTarget.set(slopeTarget);
});
xf.reg('ui:slope-target-inc', (_, db) => {
    db.slopeTarget = models.slopeTarget.inc(db.slopeTarget);
});
xf.reg(`ui:slope-target-dec`, (_, db) => {
    db.slopeTarget = models.slopeTarget.dec(db.slopeTarget);
});

// Profile
/**
 * Allow manual FTP/body-mass changes only when Intervals.icu is disconnected. Connection errors and
 * provider-owned values produce a visible message rather than silently enabling an override.
 */
function canEditProfile() {
    try {
        if(!intervals.status().connected) return true;
    } catch(error) {
        xf.dispatch('ui:modal:error:open', error.message);
        return false;
    }
    xf.dispatch('ui:modal:error:open', 'FTP and body mass are managed by Intervals.icu. Change them there, or disconnect first.');
    return false;
}
xf.reg('ui:ftp-set', (ftp, db) => {
    if(!canEditProfile()) return;
    db.ftp = models.ftp.set(ftp);
    models.ftp.backup(db.ftp);
});
xf.reg('ui:weight-set', (weight, db) => {
    if(!canEditProfile()) return;
    db.weight = models.weight.set(weight);
    models.weight.backup(db.weight);
});
xf.reg('intervals:profile', (profile, db) => {
    db.ftp = models.ftp.set(profile.ftp);
    db.weight = models.weight.set(profile.weight);
    models.ftp.backup(db.ftp);
    models.weight.backup(db.weight);
});
xf.reg('ui:theme-switch', (_, db) => {
    db.theme = models.theme.switch(db.theme);
    models.theme.backup(db.theme);
});

xf.reg('ui:dock-mode-switch', (_, db) => {
    db.theme = models.dockMode.switch(db.dockMode);
    models.dockMode.backup(db.dockMode);
});
xf.reg('ui:measurement-switch', (_, db) => {
    db.measurement = models.measurement.switch(db.measurement);
    models.measurement.backup(db.measurement);
});

xf.reg('ui:volume-mute', (_, db) => {
    db.volume = models.volume.mute();
    models.volume.backup(db.volume);
});
xf.reg('ui:volume-down', (_, db) => {
    db.volume = models.volume.dec(db.volume);
    models.volume.backup(db.volume);
});
xf.reg(`ui:volume-up`, (_, db) => {
    db.volume = models.volume.inc(db.volume);
    models.volume.backup(db.volume);
});

// Workouts
xf.reg('workout', (workout, db) => {
    db.workout = models.workout.set(workout);
});
/**
 * Recheck a coaching start at the final entry point: current plan, today's unresolved cycling
 * session, adult confirmation, no pause and unchanged FTP. A stale calendar selection must not
 * bypass these checks.
 */
xf.reg('ui:coaching:select', (workout, db) => {
    try {
        const data = coachingService().data, profile = data.profile;
        const current = data.plan?.workouts.find(w => w.id === workout.coachingWorkoutId);
        if(data.plan?.trainingPaused || data.safetyStatus) {
            throw new Error('Training is paused while pain or illness is reported.');
        }
        if(profile?.adultAthleteConfirmed !== true) {
            throw new Error('Confirm that the athlete is 18 or older by reconfiguring the plan before starting it.');
        }
        if(data.plan?.status !== 'active' || data.plan.trainingPaused || data.safetyStatus ||
           data.profile?.adultAthleteConfirmed !== true || !current || current.status !== 'scheduled' ||
           current.date !== localDay(new Date().toISOString(), profile.timeZone)) {
            throw new Error('Only unresolved workouts scheduled for today in the active coaching plan can be started.');
        }
        if(current.sport === 'running') {
            throw new Error('Runs are not played on the trainer. Follow the pace guide in the calendar or export the ZWO to your watch.');
        }
        if(profile.ftp == null) {
            throw new Error('FTP is unavailable. Use duration/RPE guidance, or set FTP and regenerate for power-based execution.');
        }
        if(profile.ftp !== db.ftp) {
            throw new Error('FTP has changed since plan creation. Archive and regenerate the coaching plan before starting its workouts.');
        }
        db.workout = models.workout.set(toAppWorkout(current));
        xf.dispatch('ui:page-set', 'home');
    } catch(error) {
        console.error('Unable to start coaching workout:', error);
        xf.dispatch('coaching:error', error.message);
    }
});
xf.reg('ui:workout:select', (id, db) => {
    db.workout = models.workouts.get(db.workouts, id);
});
xf.reg('ui:planned:select', (id, db) => {
    db.workout = models.planned.get(id);
});
xf.reg('ui:workout:remove', (id, db) => {
    db.workouts = models.workouts.remove(db.workouts, id);
});
xf.reg('ui:workout:upload', async function(files, db) {
    for(let file of Object.values(files)) {
        const { result, name } = await models.workout.readFromFile(file);
        const workout = models.workout.parse(result, name);
        models.workouts.add(db.workouts, workout);
        xf.dispatch('db:workouts', db);
    }

});
/**
 * Save or retry the FIT recording first, then hand pending recordings to the local Coach. A
 * coaching failure leaves the recording saved and marked for retry; a file-save failure keeps the
 * session available for retry.
 */
async function saveStoppedRide(_, db) {
    try {
        xf.dispatch('activity:saving');
        const recording = models.activity.pendingRecording ? models.activity.retrySave(db)
            : models.activity.createFromCurrent(db);
        const record = await recording;
        try {
            const coach = coachingService();
            const sync = await syncRecordedRides(coach);
            db.activity = await models.activity.restore();
            if(!coach.syncPending && sync.planReviewRequired) await coach.advance();
            xf.dispatch('coaching:changed');
        } catch(error) {
            console.error('Ride saved, but coaching could not be updated:', error);
            xf.dispatch('coaching:error', `Ride saved on this device; the local coaching update is pending and will retry on reload: ${error.message}`);
        }
        xf.dispatch('activity:save:success', record.ride);
    } catch (err) {
        console.error(`Error on activity save: `, err);
        xf.dispatch('activity:save:fail');
    }

}
/**
 * Discard and save are distinct paths. A discard resets the live session without creating a new
 * activity; successful saves reset it only after persistence succeeds.
 */
xf.reg('watch:stopped', (event, db) => {
    if(event?.discard) {
        models.session.reset(db);
        xf.dispatch('activity:discarded');
    } else {
        void saveStoppedRide(event, db);
    }
});
xf.reg('ui:activity:retry-save', saveStoppedRide);
xf.reg('activity:save:success', (e, db) => {
    models.session.reset(db);
});
xf.sub('ui:activity:upload:by:id', (id) => {
    models.activity.upload(id);
});
// download the current activity as a .fit file
xf.reg('ui:activity:save', (_, db) => {
    xf.dispatch(`ui:page-set`, 'workouts');
});

xf.reg('course:index', (index, db) => {
    db.courseIndex = index;
});

xf.reg('course:position', (position, db) => {
    db.position_lat = position.position_lat;
    db.position_long = position.position_long;
});

// Wake Lock
xf.reg('lock:beforeunload', (e, db) => {
    // backup session
    models.session.backup(db);
});
xf.reg('lock:release', (e, db) => {
    // backup session
    models.session.backup(db);
});

// Request ANT+ Device
xf.reg('ui:ant:request:selected', (x, db) => {
    db.antDeviceId = db.antSearchList.filter(d => {
        return d.deviceNumber === parseInt(x);
    })[0];
});
/** Avoid showing the same discovered ANT+ device number more than once in the scan list. */
function includesDevice(devices, id) {
    return devices.some(d => d.deviceNumber === id.deviceNumber);
}
xf.reg(`ant:search:found`, (x, db) => {
    if(!x || x.deviceNumber === undefined) return;
    if(includesDevice(db.antSearchList, x)) return;
    db.antSearchList.push(x);
    db.antSearchList = db.antSearchList;
});
xf.reg(`ant:search:stopped`, (x, db) => {
    db.antSearchList = [];
});

xf.reg('auth', (x, db) => {
    // TODO: remove?
});

xf.reg('services', (x, db) => {
    db.services = Object.assign(db.services, x);
});


//
/**
 * Restore settings, open local storage, load history, retry saved-ride hand-offs and restore any
 * unfinished session. Announce app:ready only after this sequence; errors become app:error.
 */
xf.reg('app:start', async function(_, db) {
    try {

    db.dockMode = models.dockMode.set(models.dockMode.restore());
    models.dockMode.apply(db.dockMode);

    db.ftp = models.ftp.set(models.ftp.restore());
    db.weight = models.weight.set(models.weight.restore());
    db.theme = models.theme.set(models.theme.restore());
    db.measurement = models.measurement.set(models.measurement.restore());
    db.volume = models.volume.set(models.volume.restore());
    db.dataTileSwitch = models.dataTileSwitch.set(models.dataTileSwitch.restore()),

    db.sources = models.sources.set(models.sources.restore());

    // IndexedDB Schema Version 3
    await idb.start(accountDatabase(), 3, ['session', 'workouts', 'activity']);
    db.workouts = await models.workouts.restore();
    db.activity = await models.activity.restore();
    try {
        await initializeCoaching();
        const sync = await syncRecordedRides(coachingService());
        coachingService().syncPending = intervals.status().connected;
        if(!coachingService().syncPending && sync.planReviewRequired) await coachingService().advance();
        xf.dispatch('coaching:changed');
    } catch(error) {
        console.error('Unable to review coaching plan:', error);
        xf.dispatch('coaching:error', error.message);
    }
    db.workout = models.workout.restore(db);
    models.planned.restore();

    await models.session.restore(db);
    xf.dispatch('workout:restore');
    xf.dispatch('activity:restore');

    models.kcal.restore(db);
    models.powerLap.restore(db);
    models.powerAvg.restore(db);
    models.cadenceLap.restore(db);
    models.cadenceAvg.restore(db);
    models.heartRateLap.restore(db);
    models.heartRateAvg.restore(db);

    const sound = Sound({volume: db.volume});
    sound.start();

    xf.dispatch('app:ready');
    // TODO: remove
    // xf.dispatch(`ui:page-set`, 'workouts');

    // TRAINER MOCK
    // trainerMock.init();
    } catch(error) {
        console.error('Application startup failed:', error);
        xf.dispatch('app:error', error.message);
    }
});

/**
 * Announce that the state/event wiring module has loaded. Actual storage restoration occurs later
 * in the app:start handler.
 */
function start () {
    console.log('start db');
    xf.dispatch('db:start');

    // UI test
    // setInterval(function() {
    //     xf.dispatch('watch:elapsed', 1);
    //     xf.dispatch('power', 180);
    //     xf.dispatch('cadence', 80);
    //     xf.dispatch('heartRate', 140 + (Math.random() * 10));
    //     xf.dispatch('smo2', 71.17); // + (Math.random() * 10));
    //     xf.dispatch('thb', 11.14); // + (Math.random() / 2));
    //     xf.dispatch('coreBodyTemperature', 38.12);
    //     xf.dispatch('skinTemperature', 38.47);
    // }, 1000);
    // end UI test
}

start();

export { db };
