/**
 * Summarizes the training information available at a particular date. It calculates trends and
 * marks weak or missing evidence rather than diagnosing fitness or readiness. Each snapshot uses
 * one load scale: mixing power points, heart-rate estimates and perceived-effort scores would
 * produce a meaningless total. Other-sport feedback can inform caution, but its training time is
 * kept separate.
 */

import { DEFAULTS, VERSION, addDays, daysBetween, sum, mean, metric, positive, round, sportOf,
    validateProfile, validateCoachingConfig } from './domain.js';

export const POWER_DURATIONS = [5, 15, 30, 60, 180, 300, 720, 1200, 1800, 2400, 3600];

/**
 * Fit a simple power-versus-duration model to explicitly maximal efforts. Return estimated critical
 * power (watts), W-prime (joules) and fit quality only when evidence and plausibility checks pass;
 * otherwise explain why they are unavailable. This does not set FTP.
 */
export function estimateCriticalPower(efforts, rules = DEFAULTS) {
    const config = validateCoachingConfig(rules);
    const valid = efforts.filter(e => e.maximal === true && e.seconds >= config.cpMinimumDuration &&
        e.seconds <= config.cpMaximumDuration &&
        positive(e.watts));
    /**
     * Represent a rejected or under-supported estimate with missing values and a reason, not a
     * fabricated performance score.
     */
    const unavailable = reason => ({cp: null, wPrime: null, fitQuality: null, version: VERSION, reason});
    if(new Set(valid.map(e => e.seconds)).size < config.cpMinimumEfforts ||
       Math.max(...valid.map(e => e.seconds)) / Math.min(...valid.map(e => e.seconds)) < config.cpMinimumDurationRatio) {
        return unavailable(`Requires ${config.cpMinimumEfforts} explicitly maximal efforts spanning at least a ${config.cpMinimumDurationRatio}:1 duration range (${config.cpMinimumDuration}-${config.cpMaximumDuration} s).`);
    }
    const xs = valid.map(e => 1 / e.seconds);
    const ys = valid.map(e => e.watts);
    const mx = mean(xs), my = mean(ys);
    const slope = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sum(xs.map(x => (x - mx) ** 2));
    const cp = my - slope * mx;
    const residual = sum(xs.map((x, i) => (ys[i] - cp - slope * x) ** 2));
    const variance = sum(ys.map(y => (y - my) ** 2));
    const fitQuality = variance > 0 ? 1 - residual / variance : 0;
    if(!Number.isFinite(cp) || !Number.isFinite(slope) || !Number.isFinite(fitQuality) ||
       cp < config.cpMinimumPower || cp > config.cpMaximumPower ||
       slope < config.wPrimeMinimum || slope > config.wPrimeMaximum ||
       fitQuality < config.cpMinimumFitQuality) {
        return unavailable(`Fit rejected: CP/W-prime outside configured ranges or R-squared below ${config.cpMinimumFitQuality}.`);
    }
    return {cp: round(cp), wPrime: round(slope), fitQuality, version: VERSION,
        reason: 'Two-parameter power = CP + W-prime / seconds least-squares fit; FTP remains separate.'};
}

/**
 * Find the best observed average power for several effort lengths using supplied summaries or
 * sliding windows of one-second samples. Observed bests are not automatically maximal tests.
 */
export function powerDuration(activities, weight) {
    return POWER_DURATIONS.map(seconds => {
        let best = null;
        for(const activity of activities) {
            for(const e of activity.bestEfforts.filter(e => e.seconds === seconds)) {
                if(!best || e.watts > best.watts) best = {...e, date: activity.day, context: 'unknown'};
            }
            const stream = activity.streams.power || [];
            let total = 0;
            for(let i = 0; i < stream.length; i++) {
                total += stream[i];
                if(i >= seconds) total -= stream[i - seconds];
                if(i >= seconds - 1 && (!best || total / seconds > best.watts)) {
                    best = {watts: total / seconds, date: activity.day,
                        context: i - seconds + 1 >= 3600 ? 'after-60-minutes' : 'early',
                        maximal: false};
                }
            }
        }
        return {seconds, watts: best?.watts ?? null, wKg: best ? best.watts / weight : null,
            date: best?.date ?? null, context: best?.context ?? 'unknown',
            reason: best ? 'Best observed value; not necessarily a maximal effort.' : 'No suitable stream or reliable best-effort summary.',
            confidence: best ? 'medium' : 'unavailable'};
    });
}

/**
 * Count observed seconds in power and heart-rate zones separately. A zone is an intensity band
 * relative to FTP or maximum heart rate; the result reports missing evidence when no usable samples
 * exist.
 */
export function intensityDistribution(activities, profile, config = DEFAULTS) {
    /**
     * Place each valid sample into both detailed intensity bands and easy/moderate/hard bands,
     * without estimating time for unrecorded samples.
     */
    function distribution(key, reference, thresholds, threeCuts) {
        const zones = Array(thresholds.length + 1).fill(0);
        const three = [0, 0, 0];
        for(const a of activities) {
            for(const v of a.streams[key] || []) {
                if(!positive(reference)) continue;
                const ratio = v / reference;
                zones[thresholds.findIndex(t => ratio <= t) < 0 ? thresholds.length :
                    thresholds.findIndex(t => ratio <= t)]++;
                three[ratio <= threeCuts[0] ? 0 : ratio <= threeCuts[1] ? 1 : 2]++;
            }
        }
        return {seconds: zones, threeZoneSeconds: three, reference: reference ?? null,
            thresholds, version: VERSION, confidence: sum(zones) ? 'medium' : 'unavailable'};
    }
    return {
        power: distribution('power', profile.ftp, config.powerZones, config.powerThreeZoneThresholds),
        heartRate: distribution('heartRate', profile.maxHeartRate, config.heartRateZones, config.heartRateThreeZoneThresholds),
    };
}

/**
 * Compare the early and late parts of sufficiently long, steady rides with paired power/heart-rate
 * samples. Return low-confidence observations of fade and drift, not an explanation of their
 * biological cause.
 */
export function estimateDurability(activities, rules = DEFAULTS) {
    const config = validateCoachingConfig(rules);
    const observations = [];
    for(const a of activities) {
        const p = a.streams.power, h = a.streams.heartRate;
        if(!p || !h || p.length < config.durabilityMinimumSeconds ||
           h.length !== p.length || !positive(a.ftp)) continue;
        const samples = p.slice(config.durabilityWarmupSeconds);
        const avg = mean(samples);
        const cv = Math.sqrt(mean(samples.map(v => (v - avg) ** 2))) / avg;
        if(avg < a.ftp * config.durabilityMinimumPowerShare ||
           avg > a.ftp * config.durabilityMaximumPowerShare ||
           cv > config.durabilityMaximumPowerVariation ||
           h.some(v => v < config.durabilityMinimumHeartRate)) continue;
        const mid = config.durabilityWarmupSeconds + Math.floor(samples.length / 2);
        const earlyPower = mean(p.slice(config.durabilityWarmupSeconds, mid)), latePower = mean(p.slice(mid));
        const earlyHR = mean(h.slice(config.durabilityWarmupSeconds, mid)), lateHR = mean(h.slice(mid));
        observations.push({date: a.day, powerFade: (earlyPower - latePower) / earlyPower,
            decoupling: 1 - (latePower / lateHR) / (earlyPower / earlyHR)});
    }
    return metric(observations.length ? observations : null, 'low',
        'Only >=60 min paired streams, after 10 min warm-up, 50-75% FTP and power CV <=10%; no diagnosis.');
}

/**
 * Build the dated planning summary from history, the athlete profile and resolved workout outcomes.
 * Use only information on or before asOf, retain calculation confidence, and count successful
 * evidence-backed sessions for progression.
 */
export function estimateState(activities, profile, asOf, options = {}, outcomes = []) {
    validateProfile(profile);
    const config = validateCoachingConfig(options);
    if(config.longDays > 730 || config.readinessWindowDays > config.longDays) {
        throw new Error('Coaching history windows must not exceed 730 days or the configured long window.');
    }
    const sport = sportOf(profile);
    const allHistory = activities.filter(a => a.day <= asOf && a.day > addDays(asOf, -config.longDays));
    const history = activities.filter(a => a.sport === sport && a.day <= asOf &&
        a.day > addDays(asOf, -config.longDays));
    const otherSport = allHistory.filter(a => a.sport !== sport);
    const recent = history.filter(a => a.day > addDays(asOf, -config.mediumDays));
    // One scale for the entire snapshot, never add TSS to RPE or HR units.
    const loadSource = [sport === 'running' ? 'pace' : 'power', 'sessionRpe', 'heartRate']
        .find(key => recent.length && recent.every(a => a.loadMetrics[key]?.value != null)) ?? 'duration';
    /**
     * Read a ride on the one scale selected for this snapshot. A missing value on that scale stays
     * missing rather than switching units for just that ride.
     */
    const loadOf = a => loadSource === 'duration' ? a.duration / 60 : a.loadMetrics[loadSource]?.value;
    const longestWindow = history.filter(a => a.day > addDays(asOf, -config.runLongestSessionReferenceDays));
    const daily = [];
    let chronic = 0, acute = 0, previousChronic = 0;
    for(let i = config.longDays - 1; i >= 0; i--) {
        const day = addDays(asOf, -i);
        const rides = history.filter(a => a.day === day);
        const values = rides.map(loadOf);
        const load = sum(values.filter(v => v != null));
        chronic += (load - chronic) * (1 - Math.exp(-1 / config.chronicDays));
        acute += (load - acute) * (1 - Math.exp(-1 / config.acuteDays));
        if(i === 7) previousChronic = chronic;
        daily.push({day, load, duration: sum(rides.map(a => a.duration)), incomplete: values.some(v => v == null)});
    }
    const week = daily.slice(-7);
    const loads = week.map(d => d.load);
    const average = mean(loads);
    const deviation = Math.sqrt(mean(loads.map(l => (l - average) ** 2)));
    const monotony = deviation > 0 ? average / deviation : null;
    const recentOutcomes = outcomes.filter(o => o.date <= asOf && o.date > addDays(asOf, -config.mediumDays));
    const completed = recentOutcomes.filter(o => ['completed', 'substituted'].includes(o.status));
    const feedback = allHistory.filter(a => a.day > addDays(asOf, -config.readinessWindowDays));
    // A planned hard session is meant to feel hard: judge its RPE against the planned effort.
    /**
     * Compare reported effort with the matched workout's expected effort when available; an
     * intentionally hard session should not be judged as if it were an easy ride.
     */
    const rpeLimit = activity => {
        const expected = outcomes.find(o => o.activityId === activity.id)?.expectedRpe;
        return Number.isFinite(expected)
            ? Math.min(10, expected + config.readinessRpeMargin)
            : config.readinessHighRpe;
    };
    const signals = {
        highRpe: feedback.some(a => a.rpe != null && a.rpe >= rpeLimit(a)),
        lowSleep: feedback.some(a => a.feedback.sleepQuality != null &&
            a.feedback.sleepQuality <= config.readinessLowSleepQuality),
        lowLegFreshness: feedback.some(a => a.feedback.legFreshness != null &&
            a.feedback.legFreshness <= config.readinessLowLegFreshness),
        highSoreness: feedback.some(a => a.feedback.muscleSoreness != null &&
            a.feedback.muscleSoreness >= config.readinessHighSoreness),
        highStress: feedback.some(a => a.feedback.stress != null &&
            a.feedback.stress >= config.readinessHighStress),
    };
    const concerns = [
        signals.highRpe ? 'High recent perceived exertion.' : null,
        signals.lowSleep ? 'Low reported sleep quality (monitoring signal; not used alone to reduce training).' : null,
        signals.lowLegFreshness ? 'Low reported leg freshness.' : null,
        signals.highSoreness ? 'High reported soreness.' : null,
        signals.highStress ? 'High reported stress.' : null,
    ].filter(Boolean);
    const extremeSoreness = feedback.some(a => a.feedback.muscleSoreness != null &&
        a.feedback.muscleSoreness >= config.readinessExtremeSoreness);
    const extremeLegFreshness = feedback.some(a => a.feedback.legFreshness != null &&
        a.feedback.legFreshness <= config.readinessExtremeLegFreshness);
    const signalWeights = {
        highRpe: config.readinessRpeScore,
        lowSleep: config.readinessSleepScore,
        lowLegFreshness: extremeLegFreshness ? Math.max(config.readinessLegFreshnessScore, config.readinessExtremeScore)
            : config.readinessLegFreshnessScore,
        highSoreness: extremeSoreness ? Math.max(config.readinessSorenessScore, config.readinessExtremeScore)
            : config.readinessSorenessScore,
        highStress: config.readinessStressScore,
    };
    if(extremeSoreness) concerns.push('Extreme soreness reported: if this is pain rather than ordinary training soreness, report pain to pause training and seek a qualified assessment.');
    const readinessScore = sum(Object.entries(signals).map(([key, present]) =>
        present ? signalWeights[key] : 0));
    const cautionSignals = Object.keys(signals).filter(key => signals[key]);
    const readinessStatus = readinessScore >= config.readinessCautionScore
        ? 'caution' : concerns.length ? 'monitor' : 'unknown';
    // Hard sessions need regular recent training, not a particular sensor: power, pace, heart rate
    // or RPE are each accepted as evidence that intensity was observed.
    const recentWeeks = new Set(recent.map(a => Math.floor(daysBetween(a.day, asOf) / 7))).size;
    const intensityEvidence = recent.filter(a => a.intensityFactor != null || a.averageHeartRate != null ||
        a.rpe != null).length;
    const sufficient = recent.length >= config.sufficiencyMinimumSessions &&
        recentWeeks >= config.sufficiencyMinimumWeeks &&
        intensityEvidence >= recent.length * config.sufficiencyIntensityEvidenceShare;
    const confidence = sufficient && recent.every(a => ['A', 'B'].includes(a.dataLevel)) ? 'medium' : 'low';
    const powerCurve = powerDuration(recent, profile.weight);
    const baseline = powerDuration(history, profile.weight);
    const cp = estimateCriticalPower(recent.flatMap(a => a.bestEfforts), config);
    const longestActivity = longestWindow.reduce((best, activity) =>
        !best || activity.duration > best.duration ? activity : best, null);
    const activityLoads = history.map(activity => ({id: activity.id, day: activity.day, start: activity.start,
        durationMinutes: activity.duration / 60,
        load: sport === 'running' ? activity.loadMetrics.pace?.value : activity.loadMetrics.power?.value,
        plannedEquivalentLoad: (sport === 'running' ? activity.loadMetrics.pace?.value :
            activity.loadMetrics.power?.value) ?? (activity.duration / 60 *
                (sport === 'running' ? config.runInitialLoadPower : config.initialLoadPower) ** 2 * 100 / 60)}));
    const lastActivityDate = history.reduce((latest, activity) => activity.day > latest ? activity.day : latest, '');
    const rpes = recent.filter(a => a.rpe != null).sort((a, b) => a.start.localeCompare(b.start));
    const half = Math.floor(rpes.length / 2);
    return {
        id: `${profile.id}:${asOf}:${VERSION}`, athleteId: profile.id, date: asOf, version: VERSION, config, sport,
        profileInputs: JSON.parse(JSON.stringify(profile)),
        ftp: {...metric(profile.ftp ?? null, 'medium', 'Athlete-declared FTP, not inferred CP.'), source: 'athlete-profile'},
        wKg: metric(profile.ftp ? profile.ftp / profile.weight : null, 'medium', 'Declared FTP / body mass.'),
        thresholdPace: metric(profile.thresholdPace ?? null, 'medium', 'Athlete-declared running threshold pace, seconds per km.'),
        longestRecentSessionMinutes: longestActivity ? longestActivity.duration / 60 : 0,
        longestRecentSessionDate: longestActivity?.day ?? null,
        lastActivityDate: lastActivityDate || null,
        activityLoads,
        criticalPower: cp, maximumAerobicPower: metric(null, 'unavailable', 'No validated MAP protocol supplied.'),
        powerDuration: powerCurve, baselinePowerDuration: baseline,
        performanceComparison: 'Missing maximal efforts are not evidence of performance decline.',
        weeklyDuration: history.length ? sum(week.map(d => d.duration)) / 60 : null,
        baselineWeeklyMinutes: sum(recent.map(a => a.duration)) / 60 / (config.mediumDays / 7),
        weeklyLoad: history.length ? sum(loads) : null,
        chronicLoad: history.length ? chronic : null, acuteLoad: history.length ? acute : null,
        formBalance: history.length ? chronic - acute : null, rampRate: history.length ? chronic - previousChronic : null,
        rollingLoad: history.length ? sum(daily.map(d => d.load)) : null,
        shortWindowLoad: history.length ? sum(daily.slice(-config.shortDays).map(d => d.load)) : null,
        dailyLoad: daily, loadSource,
        loadConfidence: confidence,
        metricConfidence: Object.fromEntries(['weeklyDuration', 'weeklyLoad', 'chronicLoad', 'acuteLoad',
            'formBalance', 'rollingLoad', 'rampRate'].map(key => [key, history.length ? confidence : 'unavailable'])),
        loadExplanation: 'Modelled load indicators, not direct biological measurements; zero-initialized over the historical window.',
        monotony: metric(monotony, confidence, deviation > 0 ? 'Mean daily load / population standard deviation.'
            : 'Undefined: no variation in observed daily loads.'),
        strain: metric(monotony == null ? null : sum(loads) * monotony, confidence, 'Weekly load x monotony.'),
        intensityDistribution: intensityDistribution(recent, profile, config),
        durability: estimateDurability(recent, config),
        completionRate: metric(recentOutcomes.length ? completed.length / recentOutcomes.length : null,
            confidence, 'Completed or substituted / resolved workouts.'),
        workoutSuccessRate: metric(completed.length ? completed.filter(o => o.quality >= config.progressionMinimumQuality).length / completed.length : null,
            confidence, 'Completed workouts with quality >=0.8 / completed workouts.'),
        successfulSessionsByFamily: Object.fromEntries([...new Set(recentOutcomes.map(o => o.family).filter(Boolean))]
            .map(family => [family, recentOutcomes.filter(o => o.family === family &&
                ['completed', 'substituted'].includes(o.status) && o.quality >= config.progressionMinimumQuality &&
                o.progressionEligible === true).length])),
        recentRpeTrend: metric(half ? mean(rpes.slice(half).map(a => a.rpe)) -
            mean(rpes.slice(0, half).map(a => a.rpe)) : null, 'low', 'Recent half minus earlier half mean RPE.'),
        readiness: {concerns: [...new Set(concerns)], signals, score: readinessScore,
            cautionThreshold: config.readinessCautionScore, status: readinessStatus,
            confidence: concerns.length ? 'low' : 'unavailable',
            reason: readinessScore >= config.readinessCautionScore
                ? `Combined subjective signals (${cautionSignals.join(', ')}) reached the configured caution threshold; this is not a diagnosis.`
                : signals.lowSleep ? 'Sleep is a monitoring signal only; it does not independently reduce training.'
                    : concerns.length ? 'Subjective signals are below the combined caution threshold; monitor, do not diagnose.'
                        : 'No recent subjective signals; this is not proof of readiness.'},
        sufficiency: sufficient ? 'supported' : recent.length ? 'limited' : 'insufficient',
        confidence, activityCount: history.length, recentActivityCount: recent.length,
        warnings: ['Load models use supplied history only; missing imports are not proof of rest.',
            ...(otherSport.length ? ['Other-sport duration is not combined with this sport load; recent subjective feedback from those activities is considered.'] : []),
            ...new Set(history.flatMap(a => a.warnings)),
            ...(daily.some(d => d.incomplete) ? ['Some historical loads unavailable on the chosen scale.'] : [])],
    };
}
