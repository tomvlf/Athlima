/**
 * Converts recordings and imported activities into one consistent format for the Coach. "Normalize"
 * here means standardize names, units and missing values, not judge an athlete. Measurements keep
 * their source and warnings. Missing power is never silently invented, and average power is not
 * treated as normalized power, a separate effort-weighted estimate.
 */

import { VERSION, positive, mean, metric, localDay, date } from './domain.js';
import { powerAccumulator } from './power.js';
import { sports } from './activity-types.js';

/**
 * Accept a measurement only when it is finite and inside its allowed range. Missing input stays
 * null; invalid supplied input also adds a warning explaining its exclusion.
 */
function optional(value, name, warnings, min = 0, max = Infinity) {
    if(value == null) return null;
    if(!Number.isFinite(value) || value < min || value > max) {
        warnings.push(`Invalid ${name}; excluded from calculations.`);
        return null;
    }
    return value;
}

/**
 * Validate an activity's identity, timestamp and seconds of duration, then derive only the metrics
 * supported by its data. Return a new record with source details, local calendar day, confidence
 * and warnings. The input is not saved here.
 */
export function normalizeActivity(raw, profile = {timeZone: 'UTC'}) {
    profile = profile || {timeZone: 'UTC'};
    if(!raw.id || !positive(raw.duration) || raw.duration > 604800 || typeof raw.start !== 'string' ||
       !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw.start) || !Number.isFinite(Date.parse(raw.start))) {
        throw new Error('Activity requires a stable id, ISO start timestamp and positive duration in seconds.');
    }
    date(raw.start.slice(0, 10));
    const warnings = [];
    const timeZone = raw.timeZone || profile.timeZone;
    if(!timeZone) throw new Error('An activity or athlete time zone is required.');
    const day = localDay(raw.start, timeZone);
    const sport = typeof raw.sport === 'string' && sports.includes(raw.sport) ? raw.sport : 'cycling';
    // The athlete FTP is a cycling threshold; other sports only use a provider-supplied threshold.
    const ftp = optional(raw.ftp ?? (sport === 'cycling' ? profile.ftp : null), 'FTP', warnings, 1);
    const rpe = optional(raw.rpe, 'RPE', warnings, 0, 10);
    let power = optional(raw.normalizedPower ?? raw.weightedPower, 'normalized power', warnings, 0, 3000);
    let avgPower = optional(raw.averagePower, 'average power', warnings, 0, 3000);
    let hr = optional(raw.averageHeartRate, 'average heart rate', warnings, 1, 255);
    let averagePowerSource = avgPower != null ? 'source-summary' : 'unavailable';
    let averageHeartRateSource = hr != null ? 'source-summary' : 'unavailable';
    const inputStreams = raw.streams || {};
    const streams = {};
    for(const key of ['power', 'heartRate']) {
        const values = inputStreams[key];
        if(values != null) {
            if(!Array.isArray(values) || values.length > raw.duration + 1 ||
               values.some(v => !Number.isFinite(v) || (key === 'power' ? v < 0 : v <= 0) ||
                   v > (key === 'power' ? 3000 : 255))) {
                warnings.push(`Invalid ${key} stream; expected contiguous one-second samples.`);
            } else if(values.length) streams[key] = [...values];
        }
    }
    if(avgPower == null && streams.power?.length >= raw.duration * 0.9) {
        avgPower = mean(streams.power);
        averagePowerSource = 'derived-stream-mean';
    }
    if(hr == null && streams.heartRate?.length >= raw.duration * 0.9) {
        hr = mean(streams.heartRate);
        averageHeartRateSource = 'derived-stream-mean';
    }
    const sourceMaxPower = optional(raw.maximumPower, 'maximum power', warnings, 0, 3000);
    const sourceMaxHR = optional(raw.maximumHeartRate, 'maximum HR', warnings, 1, 255);
    const maxPower = sourceMaxPower ?? (streams.power ? streams.power.reduce((a, b) => Math.max(a, b), 0) : null);
    const maxHR = sourceMaxHR ?? (streams.heartRate ? streams.heartRate.reduce((a, b) => Math.max(a, b), 0) : null);
    let powerSource = power == null ? 'unavailable' : 'source-summary';
    if(power == null && streams.power?.length >= 30 && streams.power.length >= raw.duration * 0.9) {
        const calculation = powerAccumulator();
        streams.power.forEach(value => calculation.add(value));
        power = calculation.value();
        powerSource = 'derived-30s-rolling-fourth-power';
    }
    const intensity = power != null && ftp ? power / ftp : null;
    if(power == null && sport === 'cycling') warnings.push('Normalized power unavailable; average power is not used as normalized power.');
    if(!ftp && (sport === 'cycling' || power != null)) warnings.push('FTP unavailable; power load unavailable.');
    const tss = intensity == null ? null : raw.duration / 3600 * intensity ** 2 * 100;
    const distance = optional(raw.distance, 'distance', warnings);
    // Running load: average speed relative to threshold speed; no grade adjustment is available.
    const thresholdPace = sport === 'running'
        ? optional(raw.thresholdPace ?? profile.thresholdPace ?? null, 'threshold pace', warnings, 120, 900) : null;
    let speed = sport === 'running' && distance > 0 ? distance / raw.duration : null;
    if(speed != null && (speed < 0.5 || speed > 7)) {
        warnings.push('Implausible running speed; pace load unavailable.');
        speed = null;
    }
    if(sport === 'running' && speed != null && !thresholdPace) warnings.push('Threshold pace unavailable; pace load unavailable.');
    const paceIntensity = speed != null && thresholdPace ? speed / (1000 / thresholdPace) : null;
    const paceLoad = paceIntensity == null ? null : raw.duration / 3600 * paceIntensity ** 2 * 100;
    const hrReserve = hr && profile.maxHeartRate > profile.restingHeartRate &&
        positive(profile.restingHeartRate) ? (hr - profile.restingHeartRate) /
            (profile.maxHeartRate - profile.restingHeartRate) : null;
    const hrLoad = hrReserve != null && hrReserve >= 0 && hrReserve <= 1
        ? raw.duration / 60 * hrReserve ** 2 : null;
    const feedback = {};
    for(const key of ['legFreshness', 'sleepQuality', 'muscleSoreness', 'stress']) {
        feedback[key] = optional(raw.feedback?.[key], key, warnings, 1, 5);
    }
    const level = streams.power && streams.heartRate && rpe != null ? 'A'
        : (power != null || avgPower != null || paceIntensity != null) && hr && rpe != null ? 'B'
            : hr && rpe != null ? 'C' : rpe != null ? 'D' : 'E';
    const loadMetrics = {
        power: metric(tss, 'medium', 'Duration hours x (normalized power / FTP)^2 x 100.',
            {duration: raw.duration, normalizedPower: power, ftp}),
        pace: metric(paceLoad, 'low', 'Duration hours x (average speed / threshold speed)^2 x 100; rTSS-like, not grade-adjusted.',
            {duration: raw.duration, distance, thresholdPace}),
        heartRate: metric(hrLoad, 'low', 'HR-reserve squared minutes; not TSS or clinical TRIMP.',
            {duration: raw.duration, averageHeartRate: hr,
                restingHeartRate: profile.restingHeartRate ?? null, maxHeartRate: profile.maxHeartRate ?? null}),
        sessionRpe: metric(rpe == null ? null : raw.duration / 60 * rpe, 'medium',
            'Duration minutes x session RPE.', {duration: raw.duration, rpe}),
    };
    const sourceWork = optional(raw.workKj, 'work', warnings);
    const derivedWork = streams.power?.length >= raw.duration * 0.9 ? streams.power.reduce((a, b) => a + b, 0) / 1000
        : avgPower != null ? avgPower * raw.duration / 1000 : null;
    const bestEfforts = (raw.bestEfforts || []).filter(e => positive(e.seconds) && positive(e.watts) &&
        e.watts <= 3000 && e.seconds <= raw.duration).map(e => ({...e}));
    if(bestEfforts.length !== (raw.bestEfforts || []).length) warnings.push('Invalid best-effort summaries excluded.');
    /**
     * Keep a small valid chart preview, not a full measurement stream. Reject malformed previews
     * with a warning so they cannot masquerade as usable sensor data.
     */
    const profileSamples = (values, name, max) => {
        if(values == null) return null;
        if(Array.isArray(values) && values.length >= 2 && values.length <= 500 &&
           values.every(v => Number.isFinite(v) && v >= 0 && v <= max)) return [...values];
        warnings.push(`Invalid ${name} profile excluded.`);
        return null;
    };
    const details = raw.details && typeof raw.details === 'object' && !Array.isArray(raw.details)
        ? JSON.parse(JSON.stringify(raw.details)) : null;
    return {
        id: String(raw.id), externalId: raw.externalId ?? raw.id, source: raw.source || 'manual',
        name: typeof raw.name === 'string' ? raw.name : sport === 'cycling' ? 'Cycling activity' : 'Activity',
        start: new Date(raw.start).toISOString(), day, timeZone,
        sport, activityType: typeof raw.activityType === 'string' ? raw.activityType : null,
        indoor: raw.indoor ?? null,
        duration: raw.duration, movingTime: optional(raw.movingTime, 'moving time', warnings),
        elapsedTime: optional(raw.elapsedTime, 'elapsed time', warnings),
        distance,
        elevation: optional(raw.elevation, 'elevation', warnings),
        averagePower: avgPower, normalizedPower: power,
        averagePowerCalculation: {source: averagePowerSource, version: VERSION},
        averageHeartRateCalculation: {source: averageHeartRateSource, version: VERSION},
        normalizedPowerCalculation: {source: powerSource, version: VERSION,
            inputs: powerSource.startsWith('derived') ? {sampleSeconds: 1, samples: streams.power.length} :
                {normalizedPower: raw.normalizedPower ?? null, weightedPower: raw.weightedPower ?? null}},
        maximumPower: maxPower,
        maximumPowerCalculation: {source: sourceMaxPower != null ? 'source-summary' :
            maxPower != null ? 'derived-observed-stream-maximum' : 'unavailable', version: VERSION},
        averageHeartRate: hr, maximumHeartRate: maxHR,
        maximumHeartRateCalculation: {source: sourceMaxHR != null ? 'source-summary' :
            maxHR != null ? 'derived-observed-stream-maximum' : 'unavailable', version: VERSION},
        averageCadence: optional(raw.averageCadence, 'cadence', warnings, 0, 300),
        workKj: sourceWork ?? derivedWork,
        workCalculation: sourceWork != null ? {value: sourceWork, source: 'source', version: VERSION} :
            metric(derivedWork, 'low', 'Integrated available one-second power, otherwise average power x elapsed seconds / 1000.'),
        ftp, intensityFactor: sport === 'running' ? paceIntensity : intensity,
        ...(sport === 'running' ? {averageSpeed: speed, thresholdPace} : {}),
        rpe, feedback, streams,
        bestEfforts, details,
        powerProfile: profileSamples(raw.powerProfile, 'power', 3000),
        heartRateProfile: profileSamples(raw.heartRateProfile, 'heart-rate', 255),
        trainNow: raw.trainNow === true,
        trainNowReasoning: typeof raw.trainNowReasoning === 'string'
            ? raw.trainNowReasoning.slice(0, 2000) : null,
        hasPower: !!streams.power || power != null || avgPower != null,
        hasHeartRate: !!streams.heartRate || hr != null,
        hasPowerStream: !!streams.power, hasHeartRateStream: !!streams.heartRate,
        hasIntervals: raw.hasIntervals === true,
        dataLevel: level, loadMetrics, warnings, version: VERSION,
        rawReference: raw.rawReference ?? null, original: {...raw},
        syncedAt: raw.syncedAt ?? null,
        providerIds: {...raw.providerIds},
        streamAveragePower: metric(streams.power ? mean(streams.power) : null, 'medium',
            'Mean of available one-second power samples; never substituted for normalized power.'),
    };
}

/**
 * Prepare a finished in-app ride for normalization. Only contiguous one-second records with valid
 * sensor flags become streams; gaps and disconnected sensors must not look like complete
 * measurements.
 */
export function fromRecordedRide(db, id, timestamp) {
    const records = db.records || [];
    const start = db.events?.[0]?.timestamp ?? records[0]?.timestamp ?? timestamp - db.elapsed * 1000;
    // Recorded timestamps are milliseconds. Gaps invalidate a continuous stream.
    const contiguous = records.length > 1 && records.every((r, i) =>
        i === 0 || Math.abs(r.timestamp - records[i - 1].timestamp - 1000) <= 100);
    const valid = key => records.every(record =>
        record[key === 'power' ? 'powerValid' : 'heartRateValid'] !== false);
    const complete = key => contiguous && valid(key) && records.every(r => Number.isFinite(r[key]));
    return {
        id, source: 'athlima', name: db.workout?.meta?.name || 'Free ride',
        trainNow: Boolean(db.workout?.trainNow),
        trainNowReasoning: db.workout?.trainNow?.reasoning ?? null,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        start: new Date(start).toISOString(),
        duration: db.elapsed, ftp: db.ftp, indoor: true,
        averagePower: valid('power') ? db.powerAvg : null,
        averageHeartRate: valid('heart_rate') ? db.heartRateAvg || null : null,
        maximumHeartRate: valid('heart_rate') ? db.heartRateMax || null : null,
        averageCadence: db.cadenceAvg || null, distance: db.distance || null,
        streams: {
            power: complete('power') ? records.map(r => r.power) : undefined,
            heartRate: complete('heart_rate') && records.every(r => r.heart_rate > 0)
                ? records.map(r => r.heart_rate) : undefined,
        },
    };
}
