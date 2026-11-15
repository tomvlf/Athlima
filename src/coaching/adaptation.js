/**
 * Reviews an existing plan after recordings, feedback or missed sessions. It works on a copy,
 * records what changed and rechecks the result; saving happens in CoachingService. Completed work
 * still uses the week's budget, and missing imports are not proof of rest. Temporary reductions
 * retain the original prescription so they need not permanently shrink later weeks.
 */

import { VERSION, DEFAULTS, SPORTS, sum, round, addDays, daysBetween, sportOf, validateCoachingConfig } from './domain.js';
import { progressWorkout, FAMILIES, familySpec } from './workouts.js';
import { prescribeWorkout } from './library.js';
import { validatePlan, rampReference, longestReference, qualityReferenceMinutes, initialSessionReference } from './planner.js';
import { explainAdaptation } from './explanations.js';
import { runQualityExcess, RUN_WALK_STAGES } from './running.js';

/**
 * Staged return after a sport-specific break of at least `returnToTrainingDays` since the plan start
 * (Daniels-style return shares; expert practice, not trial evidence). The plan start counts as an
 * active day because the planner already sized the plan from the history before it. An ongoing break
 * resumes on the snapshot date, so the staged return restarts for as long as no training is recorded.
 *
 * @returns {{days: number, resumedOn: string, share: (day: string) => number}|null}
 */
export function returnToTraining(state, plan, config) {
    const windowStart = addDays(state.date, 1 - config.longDays);
    const origin = plan.startDate > windowStart ? plan.startDate : windowStart;
    if(origin > state.date) return null;
    const active = [...new Set([origin, ...(state.activityLoads || []).map(a => a.day)
        .filter(day => day >= origin && day <= state.date)])].sort();
    let gap = daysBetween(active.at(-1), state.date) >= config.returnToTrainingDays
        ? {from: active.at(-1), resumedOn: state.date} : null;
    for(let i = active.length - 1; !gap && i > 0; i--) {
        if(daysBetween(active[i - 1], active[i]) >= config.returnToTrainingDays) {
            gap = {from: active[i - 1], resumedOn: active[i]};
        }
    }
    if(!gap) return null;
    const days = daysBetween(gap.from, gap.resumedOn);
    const stages = days <= config.returnToTrainingShortGapDays
        ? config.returnToTrainingShortStages : config.returnToTrainingLongStages;
    const length = Math.min(days, config.returnToTrainingMaximumDays);
    const share = day => {
        const index = Math.floor(Math.max(0, daysBetween(gap.resumedOn, day)) * stages.length / length);
        return index < stages.length ? stages[index] : 1;
    };
    return daysBetween(gap.resumedOn, state.date) < length ? {days, resumedOn: gap.resumedOn, share} : null;
}

/**
 * Translate a run/walk pattern into its progression index. Continuous running sits after all
 * run/walk stages.
 */
const walkStage = format => format?.runWalk
    ? RUN_WALK_STAGES.findIndex(([run, walk]) => run === format.runWalk[0] && walk === format.runWalk[1])
    : RUN_WALK_STAGES.length;

/** The planned session a temporary adjustment can later restore. */
const originalOf = workout => ({family: workout.family, duration: workout.duration,
    targetLoad: workout.targetLoad, progressionLevel: workout.progressionLevel,
    libraryWorkoutId: workout.libraryWorkoutId ?? null,
    ...(workout.runFormat ? {runFormat: {...workout.runFormat}} : {})});

/**
 * Beginner run-walk progression follows completed running rather than the calendar: a run may be
 * at most one stage beyond the hardest format completed in the previous 14 days, and restarts at the
 * plan's first stage when nothing was completed. Coaching heuristic, not a validated progression.
 */
function runWalkCeiling(plan, date) {
    const completed = plan.workouts.filter(w => ['completed', 'substituted'].includes(w.status) &&
        w.date <= date && daysBetween(w.date, date) < 14);
    return completed.length ? Math.max(...completed.map(w => walkStage(w.runFormat))) + 1
        : Math.min(...plan.workouts.map(w => walkStage(w.runFormat)));
}

/**
 * Hard-session progression needs evidence that the intervals were completed. A provider interval
 * summary counts; otherwise a one-second power stream must hold close to the lowest planned hard
 * target for most of the planned hard time. Duration and average power cannot show skipped intervals,
 * so runs without an interval summary are not verified.
 */
export function intervalsVerified(activity, workout, rules = DEFAULTS) {
    if(!FAMILIES[workout.family]?.hard || activity.hasIntervals === true) return true;
    const config = validateCoachingConfig(rules);
    const power = activity.streams?.power;
    const hardSteps = workout.steps.filter(s => s.power > config.hardPowerThreshold);
    if((workout.sport ?? 'cycling') !== 'cycling' || !(activity.ftp > 0) || !power?.length || !hardSteps.length) return false;
    const target = Math.min(...hardSteps.map(s => s.power)) * activity.ftp * config.intervalEvidenceTargetShare;
    const window = 3;
    let rolling = 0, held = 0;
    for(const [i, value] of power.entries()) {
        rolling += value - (i >= window ? power[i - window] : 0);
        if(i >= window - 1 && rolling / window >= target) held++;
    }
    return held >= sum(hardSteps.map(s => s.duration)) * config.intervalEvidenceTimeShare;
}

/**
 * Compare an activity with unresolved sessions in the same sport and local day. Return a match only
 * when confidence is sufficient; duration alone normally needs rider confirmation. A match and
 * proof of hard-interval completion are separate decisions.
 */
export function matchWorkout(activity, workouts, explicitId = null, rules = DEFAULTS) {
    const config = validateCoachingConfig(rules);
    if(!SPORTS.includes(activity.sport)) return {workoutId: null, confidence: 0, quality: null, reason: 'Not a coached sport.'};
    const candidates = workouts.filter(w => ['scheduled', 'missed'].includes(w.status) && w.date === activity.day &&
        (w.sport ?? 'cycling') === activity.sport);
    if(explicitId && !candidates.some(w => w.id === explicitId)) {
        return {workoutId: null, confidence: 0, quality: null, reason: 'Explicit workout is not scheduled on this local date.'};
    }
    const matches = candidates.filter(w => !explicitId || w.id === explicitId).map(w => {
        const durationQuality = Math.min(activity.duration, w.duration) / Math.max(activity.duration, w.duration);
        const powerQuality = activity.intensityFactor != null
            ? Math.max(0, 1 - Math.abs(activity.intensityFactor - w.targetIntensity)) : null;
        const quality = powerQuality == null ? durationQuality : (durationQuality + powerQuality) / 2;
        const confidence = explicitId ? 1 : durationQuality * (powerQuality == null ? 0.6 : 0.85 * powerQuality);
        const progressionEligible = intervalsVerified(activity, w, config);
        const evidence = !FAMILIES[w.family]?.hard ? ''
            : progressionEligible ? ' Interval execution is supported by an interval summary or power stream.'
                : ' Interval execution is not proven.';
        return {workoutId: w.id, confidence, quality, progressionEligible,
            reason: (explicitId ? 'Explicit session identity; quality uses duration and available summary intensity.'
                : 'Same local date, duration and available intensity.') + evidence};
    }).sort((a, b) => b.confidence - a.confidence || a.workoutId.localeCompare(b.workoutId));
    return matches[0]?.confidence >= config.automaticMatchMinimumConfidence ? matches[0]
        : {workoutId: null, confidence: matches[0]?.confidence || 0, quality: null,
            reason: 'Insufficient evidence for an automatic match; confirm a substitution explicitly.'};
}

/**
 * Re-applies the running safety rules after sessions were removed, missed or shortened: no future run
 * may exceed the spike limit against the longest run actually kept in the previous 30 days, and the
 * weekly share of demanding time stays bounded. Both rules only shorten or ease sessions.
 */
function enforceRunSafety(next, profile, config, date, changes) {
    const {minutes: initial, date: initialDate} = initialSessionReference(next, config, true);
    /**
     * Replace only the chosen running prescription and record before/after details, retaining the
     * original so the change remains explainable.
     */
    const rebuild = (workout, minutes, family, note) => {
        const previous = JSON.parse(JSON.stringify(workout));
        const index = next.weeks.findIndex(w => w.id === workout.weekId);
        const modified = progressWorkout({id: workout.id, date: workout.date, minutes, family,
            level: family === workout.family ? workout.progressionLevel : 1, phaseId: workout.phaseId,
            weekId: workout.weekId, phaseType: next.weeks[index]?.phaseType, profile, rules: config,
            weeklyMinutes: qualityReferenceMinutes(next.weeks, index),
            runFormat: workout.runFormat ? {...workout.runFormat, strides: family === workout.family
                ? workout.runFormat.strides : 0} : null});
        modified.original = workout.original ?? originalOf(workout);
        modified.adaptationNotes = [...workout.adaptationNotes, note];
        Object.assign(workout, modified);
        changes.push({id: workout.id, action: 'modified', previous, current: {...workout}});
    };
    const future = () => next.workouts.filter(w => w.date >= date && w.status === 'scheduled')
        .sort((a, b) => a.date.localeCompare(b.date));
    for(const workout of future()) {
        // Unresolved sessions before the adaptation date are not evidence of tolerated exposure.
        const cap = Math.floor(config.runSessionSpikeLimit * longestReference(workout.date,
            next.workouts.filter(w => w.weekId !== workout.weekId), initial,
            next.startDate, config, w => !['missed', 'failed'].includes(w.status) &&
                !(w.status === 'scheduled' && w.date < date), initialDate));
        if(workout.duration / 60 <= cap) continue;
        if(cap < config.minimumSessionMinutes) {
            next.workouts = next.workouts.filter(w => w.id !== workout.id);
            changes.push({id: workout.id, action: 'removed', previous: JSON.parse(JSON.stringify(workout)), current: null});
            continue;
        }
        rebuild(workout, cap, workout.family,
            'Shortened so this run stays within 10% of the longest run kept in the previous 30 days.');
    }
    for(const [index, week] of next.weeks.entries()) {
        const members = () => next.workouts.filter(w => w.weekId === week.id &&
            !['missed', 'failed'].includes(w.status));
        const hardSeconds = () => sum(members().flatMap(w => w.steps.filter(s => s.power > config.hardPowerThreshold))
            .map(s => s.duration));
        while(true) {
            const totalExceeded = hardSeconds() > sum(members().map(w => w.duration)) * config.weeklyHardTimeShare;
            const excess = runQualityExcess(members(), sum(members().map(w => w.duration / 60)), config);
            if(!totalExceeded && !excess.length) break;
            // Overdue scheduled sessions can still be completed late, so they are eased too.
            const hard = next.workouts.filter(w => w.weekId === week.id && w.status === 'scheduled' &&
                FAMILIES[w.family].hard && (totalExceeded || excess.includes(w.family)))
                .sort((a, b) => a.date.localeCompare(b.date)).at(-1);
            if(!hard) break;
            rebuild(hard, hard.duration / 60, 'endurance',
                'Changed to an easy run so quality time stays within the weekly caps.');
        }
        week.scheduledMinutes = sum(members().map(w => w.duration / 60));
        week.scheduledLoad = round(sum(members().map(w => w.targetLoad)));
    }
}

/**
 * Apply one outcome or feedback event and recalculate remaining sessions within time, load, spacing
 * and progression limits. Preserve completed prescriptions, account for overdue/unmatched work,
 * record a revision and throw if the resulting plan breaks validation rules.
 */
export function adaptPlan({plan, profile, state, trigger, date, timestamp, workoutId = null,
    activity = null, match = null}) {
    if(!['completed', 'failed', 'missed', 'substituted', 'recovery', 'unplanned', 'feedback'].includes(trigger) ||
       !Number.isFinite(Date.parse(timestamp)) || date < plan.startDate || date > plan.endDate) {
        throw new Error('Invalid adaptation trigger, timestamp or date.');
    }
    const config = validateCoachingConfig(state.config ?? plan.coachingConfig);
    const sport = sportOf(profile);
    const running = sport === 'running';
    const next = JSON.parse(JSON.stringify(plan));
    const changes = [];
    const target = workoutId ? next.workouts.find(w => w.id === workoutId) : null;
    const lateCompletion = target?.status === 'missed' && ['completed', 'substituted'].includes(trigger) &&
        activity?.day === target.date;
    if(workoutId && (!target || target.date > date || (target.status !== 'scheduled' && !lateCompletion))) {
        throw new Error('Only an unresolved workout on or before the adaptation date may be resolved.');
    }
    if(['completed', 'failed', 'substituted', 'missed'].includes(trigger) && !target) {
        throw new Error('Workout outcome requires a scheduled workout.');
    }
    if(['completed', 'substituted'].includes(trigger) && (!activity || !match)) {
        throw new Error('Completed and substituted workouts require activity evidence.');
    }
    if(target) {
        const previous = {...target};
        target.status = trigger;
        target.matchedActivity = activity?.id ?? null;
        target.matchConfidence = match?.confidence ?? null;
        target.completionQuality = match?.quality ?? null;
        target.progressionEligible = match?.progressionEligible === true;
        target.completionDurationMinutes = activity ? activity.duration / 60 : null;
        changes.push({id: target.id, action: 'resolved', previous, current: {...target}});
    }
    const reduceIntensity = state.readiness.status === 'caution' || trigger === 'recovery' || !!state.safetyStatus;
    next.trainingPaused = !!state.safetyStatus;
    // Reductions are short-term responses; sessions beyond the window keep (or regain) their planned dose.
    const windowEnd = addDays(date, config.adaptationWindowDays);
    let reduction = reduceIntensity
        ? config.readinessConservativeFactor
        : ['missed', 'failed'].includes(trigger) ||
            (match?.quality != null && match.quality < config.progressionMinimumQuality)
            ? config.outcomeReductionFactor : 1;
    if(trigger === 'unplanned' && activity && activity.duration / 60 > state.baselineWeeklyMinutes * 0.4) {
        reduction = Math.min(reduction, 0.85);
    }
    const history = [];
    /**
     * Use the initial limits and recent weekly references to bound growth. A temporary easy week
     * alone must not force every later week permanently downward.
     */
    const envelope = () => [plan.initialLimits, ...history].slice(-4);
    /**
     * Return this session's temporary reduction and whether it should become easy. Sessions beyond
     * the adjustment window use the unreduced policy.
     */
    const policy = w => {
        const factor = w.date <= windowEnd ? reduction : 1;
        return {factor, easy: factor < 1 && reduceIntensity};
    };
    // A session inside an earlier reduction window keeps that reduction until the window ends;
    // a later event may only make it stricter, never undo an athlete's or the Coach's caution early.
    /**
     * Keep an earlier caution reduction until its own window ends unless the new decision is
     * stricter.
     */
    const held = w => w.date >= date && w.status === 'scheduled' && w.original?.until >= w.date &&
        !(policy(w).factor < w.original.factor || (policy(w).easy && !w.original.easy));
    /**
     * Calculate the maximum session length from recent completed/substituted work and earlier
     * projected weeks. Missed, failed and overdue unresolved sessions are not evidence of tolerated
     * exposure.
     */
    const sessionLimit = workout => {
        const referenceDays = running ? config.runLongestSessionReferenceDays : config.cyclingSessionReferenceDays;
        const {minutes: initial, date: initialDate} = initialSessionReference(next, config, running);
        const previous = next.workouts.filter(w => w.date < workout.date && w.weekId !== workout.weekId &&
            !['missed', 'failed'].includes(w.status) && !(w.status === 'scheduled' && w.date < date));
        const recent = previous.filter(w => daysBetween(w.date, workout.date) <= referenceDays)
            .map(w => ['completed', 'substituted'].includes(w.status)
                ? w.completionDurationMinutes ?? w.duration / 60
                : (w.original?.duration ?? w.duration) / 60);
        const historical = initialDate && initialDate <= workout.date &&
            daysBetween(initialDate, workout.date) <= referenceDays ? [initial] : [];
        const reference = Math.max(0, ...recent, ...historical) ||
            (running ? config.runInitialLongestSessionMinutes : config.cyclingInitialSessionMinutes);
        return Math.floor(reference * (running ? config.runSessionSpikeLimit : config.cyclingSessionSpikeLimit));
    };
    const comeback = returnToTraining(state, plan, config);
    const walkCeiling = running && profile.experience === 'beginner' ? runWalkCeiling(next, date) : Infinity;
    // Held sessions keep their reduced dose as a ceiling; they may still shrink to respect actual load.
    /**
     * Choose the original or held prescription, reduction factor and family before rebuilding a
     * session. Run/walk limits and return-after-break stages can rule out hard efforts.
     */
    const dose = workout => {
        const isHeld = held(workout);
        const baseline = isHeld ? workout : workout.original ?? workout;
        const factor = !isHeld && workout.date <= windowEnd ? reduction : 1;
        const forceEasy = factor < 1 && reduceIntensity;
        const plannedFormat = baseline.runFormat ?? workout.runFormat ?? null;
        const walkLimited = !!plannedFormat &&
            Math.min(walkStage(plannedFormat), walkCeiling) < RUN_WALK_STAGES.length;
        const noHard = walkLimited || (!!comeback && comeback.share(workout.date) < config.returnToTrainingHardMinimumShare);
        const family = forceEasy ? 'recovery' : FAMILIES[baseline.family]?.hard && noHard ? 'endurance' : baseline.family;
        return {baseline, factor, forceEasy, held: isHeld, family, plannedFormat};
    };
    /**
     * Limit running format to an earned run/walk stage and remove strides when easy work or walking
     * is required.
     */
    const formatFor = (plannedFormat, forceEasy) => {
        if(!plannedFormat) return null;
        const stage = Math.min(walkStage(plannedFormat), walkCeiling);
        const runWalk = stage < RUN_WALK_STAGES.length ? [...RUN_WALK_STAGES[stage]] : null;
        return {...plannedFormat, runWalk, strides: forceEasy || runWalk ? 0 : plannedFormat.strides};
    };
    for(const week of next.weeks) {
        const members = next.workouts.filter(w => w.weekId === week.id);
        const frozen = members.filter(w => w.status !== 'scheduled');
        const future = members.filter(w => w.date >= date && w.status === 'scheduled');
        const planned = w => w.date >= date && w.status === 'scheduled' && w.original ? w.original : w;
        const originalMinutes = sum(members.map(w => planned(w).duration / 60));
        const originalLoad = sum(members.map(w => planned(w).targetLoad));
        // Plans generated before the planned dose was stored derive it from the pre-adjustment sessions.
        if(!Number.isFinite(week.plannedMinutes)) week.plannedMinutes = originalMinutes;
        if(!Number.isFinite(week.plannedLoad)) week.plannedLoad = round(originalLoad);
        let minuteCap = Math.min(originalMinutes,
            Math.max(...envelope().map(w => w.minutes)) * (1 + week.rampLimit));
        // Running plans are bounded by target load rather than a weekly load ramp (see scheduleWorkouts).
        let loadCap = running ? originalLoad : Math.min(originalLoad,
            Math.max(...envelope().map(w => w.load)) * (1 + week.rampLimit));
        if(['completed', 'substituted'].includes(trigger) && reduction === 1) {
            const priorEnvelope = running ? week.targetLoad : history.length
                ? Math.max(...envelope().map(w => w.load)) * (1 + week.rampLimit)
                : plan.initialLimits.load;
            loadCap = Math.min(week.targetLoad, priorEnvelope);
        }
        const byActivityId = new Map((state.activityLoads || []).map(item => [item.id, item]));
        // Everything validation counts but this adaptation cannot reshape uses the week's budget first:
        // resolved sessions (also later ones when overdue sessions are resolved in date order), rides that
        // matched nothing, and overdue sessions still awaiting an outcome.
        const resolved = members.filter(w => ['completed', 'substituted'].includes(w.status));
        const matchedIds = new Set(resolved.map(w => w.matchedActivity).filter(Boolean));
        const resolvedMinutes = sum(resolved.map(w => Math.max(w.duration / 60,
            byActivityId.get(w.matchedActivity)?.durationMinutes ?? 0)));
        const resolvedLoad = sum(resolved.map(w => Math.max(w.targetLoad,
            byActivityId.get(w.matchedActivity)?.plannedEquivalentLoad ?? 0)));
        const unmatchedActivities = (state.activityLoads || []).filter(item =>
            item.day >= week.startDate && item.day <= week.endDate &&
            item.start >= plan.generatedAt && !matchedIds.has(item.id));
        const overdue = members.filter(w => w.status === 'scheduled' && w.date < date);
        const extraMinutes = sum(unmatchedActivities.map(item => item.durationMinutes)) +
            sum(overdue.map(w => w.duration / 60));
        const extraLoad = sum(unmatchedActivities.map(item => item.plannedEquivalentLoad)) +
            sum(overdue.map(w => w.targetLoad));
        const frozenMinutes = resolvedMinutes + extraMinutes;
        const frozenLoad = resolvedLoad + extraLoad;
        loadCap = Math.max(frozenLoad, loadCap);
        const returnShare = comeback ? comeback.share(week.startDate > date ? week.startDate : date) : 1;
        if(returnShare < 1) {
            minuteCap = Math.max(frozenMinutes, Math.min(minuteCap, week.plannedMinutes * returnShare));
            loadCap = Math.max(frozenLoad, Math.min(loadCap, week.plannedLoad * returnShare));
        }
        let usedMinutes = frozenMinutes, usedLoad = frozenLoad;
        const recoveryLoadPerMinute = familySpec('recovery', sport).power ** 2 * 100 / 60;
        const weeklyMinutes = qualityReferenceMinutes(next.weeks, next.weeks.indexOf(week));
        const intended = future.map(workout => {
            const {baseline, factor, forceEasy} = dose(workout);
            const minutes = Math.min(baseline.duration / 60, sessionLimit(workout)) * factor;
            return {minutes, load: forceEasy ? minutes * recoveryLoadPerMinute : baseline.targetLoad * factor};
        });
        // Share a capped week across all remaining sessions instead of dropping or downgrading the last ones.
        const weekScale = Math.max(0, Math.min(1,
            (minuteCap - usedMinutes) / Math.max(1e-9, sum(intended.map(i => i.minutes))),
            (loadCap - usedLoad) / Math.max(1e-9, sum(intended.map(i => i.load)))));
        const pristine = future.map(w => JSON.parse(JSON.stringify(w)));
        const startWorkouts = next.workouts.slice(), startChanges = changes.length;
        /**
         * Try one shared scale for the week from the same clean starting copies. Each trial
         * rebuilds sessions and change records afresh, allowing comparison without accumulating
         * reductions from previous trials.
         */
        const fill = scale => {
        future.forEach((w, i) => {
            Object.keys(w).forEach(key => delete w[key]);
            Object.assign(w, JSON.parse(JSON.stringify(pristine[i])));
        });
        next.workouts = startWorkouts.slice();
        changes.length = startChanges;
        usedMinutes = frozenMinutes;
        usedLoad = frozenLoad;
        for(const [futureIndex, workout] of future.entries()) {
            const previous = JSON.parse(JSON.stringify(workout));
            const {baseline, factor, forceEasy, held: isHeld, family, plannedFormat} = dose(workout);
            const sessionMinutes = Math.min(baseline.duration / 60, sessionLimit(workout));
            const minutes = Math.floor(Math.min(sessionMinutes * factor * scale, minuteCap - usedMinutes) + 0.000001);
            const loadPerMinute = forceEasy ? recoveryLoadPerMinute
                : baseline.targetLoad / (baseline.duration / 60);
            const fitMinutes = Math.min(minutes, Math.floor((loadCap - usedLoad + 0.000001) / loadPerMinute));
            if(fitMinutes < config.minimumSessionMinutes) {
                next.workouts = next.workouts.filter(w => w.id !== workout.id);
                changes.push({id: workout.id, action: 'removed', previous, current: null});
                continue;
            }
            const successes = (plan.progressionBaseline?.[baseline.family] || 0) +
                next.workouts.filter(w => w.date <= date && w.family === baseline.family &&
                    ['completed', 'substituted'].includes(w.status) &&
                    w.progressionEligible === true &&
                    w.completionQuality >= config.progressionMinimumQuality).length;
            const earnedLevel = Math.min(config.progressionMaximumLevel,
                1 + Math.floor(successes / config.progressionSuccessfulSessionsPerLevel));
            // Held, eased or re-entry sessions never earn a harder progression level.
            const progressionLevel = !isHeld && family === baseline.family &&
                ['completed', 'substituted'].includes(trigger) && reduction === 1
                ? Math.max(baseline.progressionLevel, earnedLevel) : baseline.progressionLevel;
            const runFormat = running ? formatFor(plannedFormat, forceEasy) : null;
            const slot = {
                id: workout.id, date: workout.date, minutes: fitMinutes, family,
                level: forceEasy ? 1 : progressionLevel, phaseId: workout.phaseId,
                weekId: workout.weekId, phaseType: week.phaseType, profile, rules: config,
                ...(running ? {weeklyMinutes, runFormat} : {}),
            };
            // Keep the planned library workout and shorten it rather than swapping the session.
            const unchanged = fitMinutes * 60 === workout.duration && family === workout.family &&
                progressionLevel === workout.progressionLevel &&
                JSON.stringify(runFormat) === JSON.stringify(running ? workout.runFormat ?? null : null);
            const sessionBudget = loadCap - usedLoad - sum(intended.slice(futureIndex + 1).map(i => i.load)) * scale;
            let modified = unchanged ? {...workout} : prescribeWorkout(slot, {
                history: next.workouts.filter(w => w.date < workout.date),
                prefer: baseline.libraryWorkoutId ?? workout.libraryWorkoutId, rules: config, library: !running,
                maxLoad: Math.max(sessionBudget, fitMinutes * recoveryLoadPerMinute),
            });
            // Prefer a shorter session of the planned family over downgrading it to recovery.
            for(let shorter = fitMinutes - 5; !forceEasy && family !== 'recovery' &&
                usedLoad + modified.targetLoad > loadCap + 0.01 && shorter >= config.minimumSessionMinutes; shorter -= 5) {
                modified = prescribeWorkout({...slot, minutes: shorter}, {
                    history: next.workouts.filter(w => w.date < workout.date),
                    prefer: baseline.libraryWorkoutId ?? workout.libraryWorkoutId, rules: config, library: !running,
                    maxLoad: Math.min(loadCap - usedLoad, baseline.targetLoad),
                });
            }
            if(usedLoad + modified.targetLoad > loadCap + 0.01) {
                let recoveryMinutes = Math.min(fitMinutes,
                    Math.floor((loadCap - usedLoad + 0.000001) / recoveryLoadPerMinute));
                if(recoveryMinutes < config.minimumSessionMinutes) {
                    next.workouts = next.workouts.filter(w => w.id !== workout.id);
                    changes.push({id: workout.id, action: 'removed', previous, current: null});
                    continue;
                }
                modified = progressWorkout({...slot, minutes: recoveryMinutes, family: 'recovery', level: 1});
                while(recoveryMinutes >= config.minimumSessionMinutes &&
                      usedLoad + modified.targetLoad > loadCap + 0.01) {
                    recoveryMinutes--;
                    if(recoveryMinutes < config.minimumSessionMinutes) break;
                    modified = progressWorkout({...slot, minutes: recoveryMinutes, family: 'recovery', level: 1});
                }
                if(recoveryMinutes < config.minimumSessionMinutes) {
                    next.workouts = next.workouts.filter(w => w.id !== workout.id);
                    changes.push({id: workout.id, action: 'removed', previous, current: null});
                    continue;
                }
            }
            const reservedLoad = sum(future.slice(futureIndex + 1).map(w => w.targetLoad));
            const progressionHeadroom = Math.max(0, loadCap - usedLoad - workout.targetLoad - reservedLoad);
            if(progressionLevel > baseline.progressionLevel &&
               (modified.targetLoad - workout.targetLoad > progressionHeadroom + 0.01 ||
                JSON.stringify(modified.steps) === JSON.stringify(workout.steps))) {
                modified = prescribeWorkout({...slot, level: baseline.progressionLevel}, {
                    history: next.workouts.filter(w => w.date < workout.date),
                    prefer: baseline.libraryWorkoutId ?? workout.libraryWorkoutId, rules: config, library: !running,
                });
            }
            const restored = !isHeld && !forceEasy && factor === 1 && modified.family === baseline.family &&
                modified.duration === baseline.duration &&
                JSON.stringify(modified.runFormat?.runWalk ?? null) === JSON.stringify(plannedFormat?.runWalk ?? null);
            if(restored) delete modified.original;
            else if(isHeld) modified.original = workout.original;
            else {
                const {until: _until, factor: _factor, easy: _easy, ...base} = workout.original ?? originalOf(workout);
                modified.original = factor < 1 ? {...base, until: windowEnd, factor, easy: forceEasy} : base;
            }
            modified.adaptationNotes = [...workout.adaptationNotes];
            const progressed = modified.progressionLevel > baseline.progressionLevel;
            const changed = modified.duration !== workout.duration || modified.family !== workout.family ||
                modified.progressionLevel !== workout.progressionLevel ||
                JSON.stringify(modified.steps) !== JSON.stringify(workout.steps);
            const returnNote = returnShare < 1 || (comeback && family !== baseline.family && !forceEasy)
                ? `Returning after ${comeback.days} days without ${running ? 'running' : 'riding'}: ` +
                  `this week is limited to ${Math.round(returnShare * 100)}% of its planned dose` +
                  `${FAMILIES[baseline.family]?.hard && family !== baseline.family ? ' and hard efforts are replaced by easy aerobic work' : ''}.`
                : null;
            const walkNote = runFormat?.runWalk && walkStage(runFormat) < walkStage(plannedFormat)
                ? 'Run-walk stage held back until the previous stage has been completed within the last 14 days.'
                : null;
            if(changed) {
                modified.adaptationNotes.push(progressed
                    ? `Progressed after ${successes} successful ${baseline.family} sessions, within the remaining weekly load budget.`
                    : restored && workout.original ? 'Restored to the planned session after the short-term adjustment ended.'
                        : forceEasy ? explainAdaptation(trigger, reduction)
                            : returnNote ?? walkNote ?? explainAdaptation(trigger, reduction));
                Object.assign(workout, modified);
                if(restored) delete workout.original;
                changes.push({id: workout.id, action: 'modified', previous, current: {...workout}});
            } else if(restored) {
                delete workout.original;
            } else if(workout.original || factor < 1) {
                // Same dose, but the reduction window/strictness metadata must still be current.
                workout.original = modified.original;
            }
            usedMinutes += workout.duration / 60;
            usedLoad += workout.targetLoad;
        }
        return {
            load: usedLoad,
            downgraded: future.filter((w, i) => next.workouts.includes(w) && w.family !== pristine[i].family &&
                !(w.date <= windowEnd && reduceIntensity)).length + future.filter(w => !next.workouts.includes(w)).length,
        };
        };
        // Shortened templates often carry less load than a proportional cut; use the week's remaining
        // budget so one reduction does not compound through every later ramp check.
        let best = {scale: weekScale, ...fill(weekScale)};
        for(let scale = weekScale * 1.04; weekScale < 1 && best.load < loadCap * 0.98 && scale > 0 && scale < 1.25; scale *= 1.04) {
            const result = fill(Math.min(1, scale));
            if(result.downgraded <= best.downgraded && result.load > best.load + 0.01) best = {scale: Math.min(1, scale), ...result};
            if(scale >= 1) break;
        }
        fill(best.scale);
        week.scheduledMinutes = usedMinutes;
        week.scheduledLoad = round(usedLoad);
        history.push(rampReference(week, usedMinutes, usedLoad));
    }
    if(running) enforceRunSafety(next, profile, config, date, changes);
    next.revision++;
    next.sourceSnapshot = state.id;
    next.validationWarnings = [...validatePlan(next, profile, config, date), ...(next.generationWarnings || [])];
    if(next.dataSufficiency && next.dataSufficiency !== 'supported' && state.sufficiency === 'supported') {
        next.validationWarnings.push('Recent training history now supports structured hard sessions, but this plan was generated without them. Archive it and generate a new plan to include them; the Coach does not add hard sessions automatically.');
    }
    next.adaptations.push({
        trigger, previousRevision: plan.revision, newRevision: next.revision,
        observations: {snapshotId: state.id, readiness: state.readiness, activityId: activity?.id ?? null,
            match, date, returnToTraining: comeback ? {days: comeback.days, resumedOn: comeback.resumedOn} : null},
        changes, loadChange: round(sum(next.workouts.map(w => w.targetLoad)) - sum(plan.workouts.map(w => w.targetLoad))),
        reasoning: explainAdaptation(trigger, reduction), validationWarnings: next.validationWarnings,
        timestamp, plannerVersion: VERSION,
    });
    if(date >= next.endDate) next.status = 'finished';
    return next;
}
