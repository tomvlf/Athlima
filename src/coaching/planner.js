/**
 * Builds a training timetable from a profile, goal and dated summary of training history. The flow
 * is phases -> weekly time/load budgets -> individual sessions -> final checks. A budget is a
 * ceiling, not an instruction to fill every minute. These are repeatable software heuristics, not
 * promises of improvement or injury prevention; calculations do not save data or contact a service.
 */

import { VERSION, addDays, daysBetween, weekday, sum, round, sportOf, goalRegistry,
    validateProfile, validateGoal, validateCoachingConfig } from './domain.js';
import { modelGoalDemand, analyzeGaps } from './demands.js';
import { progressWorkout, FAMILIES, familySpec, stepLoad } from './workouts.js';
import { prescribeWorkout } from './library.js';
import { explainPhase, explainWeek } from './explanations.js';
import { runWalkStage, runSteps, runQualityExcess, predictedRaceSeconds } from './running.js';

/**
 * Taper length: the configured length for the goal priority (Bosquet et al. 2007: about two weeks
 * for an A event), never more than a quarter of a short plan so build work is not displaced.
 *
 * @param {object} goal - Goal with `priority`.
 * @param {number} total - Plan length in days.
 * @param {object} config - Validated coaching configuration.
 * @returns {number} Taper length in days.
 */
export function taperDays(goal, total, config) {
    const configured = goal.priority === 'A' ? config.taperDaysPriorityA
        : goal.priority === 'B' ? config.taperDaysPriorityB : config.taperDaysPriorityC;
    return Math.max(1, Math.min(configured, Math.round(total * config.taperMaximumPlanShare)));
}

/**
 * Duration proxy for Frandsen et al. (2025)'s distance-based reference; not an injury prediction.
 * Adaptation passes `counted` to ignore missed sessions, a stricter reference than validation.
 *
 * @returns {number} Reference duration in minutes.
 */
function sessionReference(day, workouts, initial, initialDate, referenceDays, fallback, counted = () => true) {
    const planned = workouts.filter(w => w.date < day && counted(w) && daysBetween(w.date, day) <= referenceDays)
        .map(w => ['completed', 'substituted'].includes(w.status)
            ? w.completionDurationMinutes ?? w.duration / 60
            : (w.original?.duration ?? w.duration) / 60);
    const history = initialDate && initialDate <= day && daysBetween(initialDate, day) <= referenceDays ? [initial] : [];
    return Math.max(0, ...planned, ...history) || fallback;
}

/**
 * Find the running-duration reference used to limit a later session. The caller chooses which
 * earlier workouts count, so completed exposure and future projections are not confused.
 */
export function longestReference(day, workouts, initial, startDate, config,
    counted = w => !['missed', 'failed'].includes(w.status), initialDate = startDate) {
    return sessionReference(day, workouts, initial, initialDate, config.runLongestSessionReferenceDays,
        config.runInitialLongestSessionMinutes, counted);
}

/**
 * Pre-plan longest-session reference. Cycling plans generated before the session cap stored none;
 * their first generated week was already bounded by the pre-plan envelope, so it stands in for that history.
 *
 * @returns {{minutes: number, date: string}} Reference minutes and the date they apply from.
 */
export function initialSessionReference(plan, config, running) {
    const stored = plan.initialLimits.longestSessionMinutes;
    const fallback = running ? config.runInitialLongestSessionMinutes : config.cyclingInitialSessionMinutes;
    const firstWeek = stored == null && !running
        ? plan.workouts.filter(w => w.weekId === plan.weeks[0]?.id).map(w => (w.original?.duration ?? w.duration) / 60)
        : [];
    return {minutes: stored ?? Math.max(fallback, ...firstWeek),
        date: plan.initialLimits.longestSessionDate ?? plan.startDate};
}

/**
 * Quality caps use the original scheduled minutes once known, preserving the reference during
 * adaptation. Tapers use preceding normal volume so a short touch of intensity remains possible.
 */
export function qualityReferenceMinutes(weeks, index) {
    const week = weeks[index];
    const previous = weeks.slice(Math.max(0, index - 4), index)
        .filter(w => !['recovery', 'taper'].includes(w.phaseType))
        .map(w => w.scheduledMinutes || w.plannedMinutes || w.targetMinutes);
    return week.phaseType === 'taper' && previous.length ? previous.at(-1)
        : week.plannedMinutes ?? week.targetMinutes;
}

/** Keeps the long-run day and prefers non-consecutive days when a beginner has more days than allowed. */
function limitRunDays(days, longDay, maximum) {
    if(days.length <= maximum) return days;
    const chosen = days.filter(d => weekday(d) === longDay).slice(0, 1);
    for(const day of days) {
        if(chosen.length < maximum && !chosen.includes(day) &&
           chosen.every(c => Math.abs(daysBetween(c, day)) > 1)) chosen.push(day);
    }
    for(const day of days) if(chosen.length < maximum && !chosen.includes(day)) chosen.push(day);
    return chosen.sort();
}

/**
 * Describe the planned share of easy, moderate and hard work from step durations. Running uses
 * fractions of threshold speed; cycling uses fractions of FTP.
 */
function intensityDistributionFor(workouts, config, sport) {
    // Running steps are fractions of threshold speed: easy up to the top of pace zone 2, hard above threshold.
    const cuts = sport === 'running' ? [config.runPaceZones[1], config.runPaceZones[3]] : config.powerThreeZoneThresholds;
    const seconds = [0, 0, 0];
    for(const step of workouts.flatMap(workout => workout.steps)) {
        seconds[step.power <= cuts[0] ? 0 : step.power <= cuts[1] ? 1 : 2] += step.duration;
    }
    const total = sum(seconds);
    return {easy: total ? seconds[0] / total : 0, moderate: total ? seconds[1] / total : 0,
        hard: total ? seconds[2] / total : 0};
}

/**
 * Splits the goal timeline into training phases with a clear purpose and focus.
 *
 * The periodisation logic groups a goal into preparation, build, specific, peak, taper,
 * and recovery blocks so that the scheduler can allocate training stress thoughtfully.
 *
 * @param {string} startDate - Plan start date in YYYY-MM-DD format.
 * @param {object} goal - Active athlete goal and objective data.
 * @param {object} state - Derived athlete state used for readiness and capacity decisions.
 * @param {object} gaps - Capability priorities and weaknesses discovered from recent state analysis.
 * @returns {Array<object>} Period blocks that define the time-based plan structure.
 */
export function periodise(startDate, goal, state, gaps) {
    const config = validateCoachingConfig(state.config);
    const total = daysBetween(startDate, goal.date);
    const taper = taperDays(goal, total, config);
    const focus = gaps.priorities.slice(0, 2).map(p => p.capability);
    const days = [];
    for(let i = 0; i <= total; i++) {
        const remaining = total - i;
        const fraction = i / total;
        const week = Math.floor(i / 7);
        let type;
        if(remaining === 0) type = 'event';
        else if(remaining <= taper) type = 'taper';
        else if(total < 21) type = 'preparation';
        else if(i < 7 && state.sufficiency !== 'supported') type = 'assessment';
        // Avoid an unnecessarily long reduction by not stacking a routine deload immediately before taper.
        else if(week % config.recoveryWeekInterval === config.recoveryWeekOffset &&
            total - week * 7 - 13 > taper) type = 'recovery';
        else if(fraction < config.basePhaseEndFraction) type = 'base';
        else if(fraction < config.buildPhaseEndFraction) type = 'build';
        else if(remaining > config.specificPhaseMinimumDays) type = 'specific';
        else type = 'peak';
        const day = addDays(startDate, i);
        const previous = days.at(-1);
        if(previous?.type === type) previous.endDate = day;
        else days.push({id: `phase-${days.length + 1}`, type, startDate: day, endDate: day,
            primaryCapabilities: focus, secondaryCapabilities: gaps.priorities.slice(2).map(p => p.capability),
            targetVolumeRange: [0, 0], targetLoadRange: [0, 0],
            targetIntensityDistribution: {easy: 0.8, moderate: 0.15, hard: 0.05},
            rationale: explainPhase(type, focus, state.sport)});
    }
    return days;
}

/**
 * Builds the weekly target envelope for each week in the plan.
 *
 * This keeps the schedule within realistic training capacity while allowing controlled
 * ramping. The model uses recent load and athlete readiness to prevent over-ambitious
 * increases in minutes and load.
 *
 * @param {string} startDate - Plan start date.
 * @param {object} goal - Goal metadata and priority.
 * @param {object} state - Estimated athlete state.
 * @param {object} profile - Session availability and weekly capacity limits.
 * @param {Array<object>} phases - Period blocks for the plan.
 * @returns {Array<object>} Weekly target objects with minutes, load, phase, and rationale.
 */
export function weeklyTargets(startDate, goal, state, profile, phases) {
    const config = validateCoachingConfig(state.config);
    const running = sportOf(profile) === 'running';
    const initialPower = running ? config.runInitialLoadPower : config.initialLoadPower;
    const planningPower = running ? config.runWeeklyPlanningLoadPower : config.weeklyPlanningLoadPower;
    const taperLength = taperDays(goal, daysBetween(startDate, goal.date), config);
    const capacity = Math.min(profile.maxWeeklyHours * 60, profile.typicalWeeklyHours * 60,
        sum(profile.availableDays.map(d => profile.maxSessionMinutes[d])));
    const ramp = state.confidence === 'medium' && state.readiness.status !== 'caution'
        ? config.maxRamp : config.lowDataRamp;
    const sufficient = state.confidence === 'medium';
    const historical = state.baselineWeeklyMinutes > 0
        ? Math.min(state.baselineWeeklyMinutes, state.weeklyDuration || config.initialMinutes)
        : config.initialMinutes;
    // Insufficient history (e.g. one short test ride) must not start below the no-history default.
    let previous = Math.min(capacity, sufficient ? historical : Math.max(historical, config.initialMinutes));
    if(state.readiness.status === 'caution') previous *= config.readinessVolumeFactor;
    let previousLoad = previous / 60 * initialPower ** 2 * 100;
    if(sufficient && state.loadSource === (running ? 'pace' : 'power') && state.activityCount) {
        const baseline = sum(state.dailyLoad.slice(-state.config.mediumDays).map(d => d.load)) / (state.config.mediumDays / 7);
        previousLoad = Math.min(previousLoad, baseline, state.weeklyLoad);
    }
    const weeks = [];
    for(let offset = 0; offset < daysBetween(startDate, goal.date); offset += 7) {
        const start = addDays(startDate, offset);
        const end = addDays(start, Math.min(6, daysBetween(start, goal.date) - 1));
        const phase = phases.find(p => p.startDate <= start && p.endDate >= start);
        const days = Array.from({length: daysBetween(start, end) + 1}, (_, i) => addDays(start, i));
        const available = days.filter(d => profile.availableDays.includes(weekday(d)));
        const minutesCap = Math.min(capacity, sum(available.map(d => profile.maxSessionMinutes[weekday(d)])));
        // A week tapers when most of its days are inside the taper, so the taper is not stretched by a week.
        const taper = days.filter(d => daysBetween(d, goal.date) <= taperLength).length * 2 >= days.length;
        const recovery = phase.type === 'recovery';
        const factor = taper ? config.taperFactor : recovery ? config.recoveryFactor : weeks.length ? 1 + ramp : 1;
        // A planned deload can return to the last four weeks' envelope, not exceed it abruptly.
        const referenceMinutes = Math.max(previous, ...weeks.slice(-4).map(w => w.targetMinutes));
        const referenceLoad = Math.max(previousLoad, ...weeks.slice(-4).map(w => w.targetLoad));
        const targetMinutes = Math.floor(Math.min(minutesCap, referenceMinutes * factor));
        const targetLoad = round(Math.min(targetMinutes / 60 * planningPower ** 2 * 100,
            referenceLoad * factor));
        const week = {id: `week-${weeks.length + 1}`, startDate: start, endDate: end,
            phaseId: phase.id, phaseType: taper ? 'taper' : phase.type,
            targetMinutes, targetLoad, rampLimit: ramp, focus: phase.primaryCapabilities,
            targetIntensityDistribution: {easy: 0.8, moderate: 0.15, hard: 0.05},
            scheduledMinutes: 0, scheduledLoad: 0, rationale: ''};
        week.rationale = explainWeek(week, state);
        weeks.push(week);
        previous = targetMinutes;
        previousLoad = targetLoad;
    }
    return weeks;
}

/**
 * Turns weekly targets and training phases into concrete workout slots.
 *
 * The scheduler allocates minutes to available training days, chooses workout families
 * based on the active phase and athlete readiness, and keeps a realistic rhythm so the
 * plan remains actionable instead of becoming an impossible stress curve.
 *
 * @param {Array<object>} weeks - Weekly target objects.
 * @param {Array<object>} phases - Period blocks in the plan.
 * @param {object} profile - Athlete availability and session constraints.
 * @param {object} state - Athlete readiness and training state.
 * @param {object} gaps - Capability and objective gaps that shape workout types.
 * @param {string} planId - Unique plan identifier used when building workout IDs.
 * @returns {Array<object>} The concrete workout schedule for the full plan.
 */
export function scheduleWorkouts(weeks, phases, profile, state, gaps, planId) {
    const config = validateCoachingConfig(state.config);
    const sport = sportOf(profile);
    const running = sport === 'running';
    const workouts = [];
    let lastHard = null;
    const scheduledHistory = [];
    const startDate = phases[0].startDate;
    const eventDate = phases.at(-1).startDate;
    const planDays = daysBetween(startDate, eventDate);
    const maxHard = state.sufficiency === 'supported' && state.readiness.status !== 'caution'
        ? profile.experience === 'beginner' ? config.beginnerHardSessionsPerWeek
            : config.experiencedHardSessionsPerWeek : 0;
    // Rotate hard sessions across the top goal-relevant capabilities in proportion to their priority,
    // instead of repeating only the first one (a mixed, mostly pyramidal distribution; Casado et al. 2022).
    const candidates = gaps.priorities.filter(p => FAMILIES[p.capability]?.hard).slice(0, config.hardFocusCandidates);
    const focusCounts = Object.fromEntries(candidates.map(p => [p.capability, 0]));
    const totalScore = sum(candidates.map(p => p.score)) || 1;
    /**
     * Choose the next hard-work capability by how far its share falls behind the goal priorities,
     * rather than always selecting the same family.
     */
    const nextFocus = () => {
        const n = sum(Object.values(focusCounts));
        return candidates.reduce((best, p) => {
            const deficit = p.score / totalScore * (n + 1) - focusCounts[p.capability];
            return deficit > best.deficit + 1e-9 ? {capability: p.capability, deficit} : best;
        }, {capability: 'threshold', deficit: -Infinity}).capability;
    };
    const initialLongest = state.longestRecentSessionMinutes > 0
        ? Math.max(config.minimumSessionMinutes, state.longestRecentSessionMinutes)
        : running ? config.runInitialLongestSessionMinutes : config.cyclingInitialSessionMinutes;
    const initialLongestDate = state.longestRecentSessionDate || startDate;
    /**
     * Limit one planned session using history and earlier weeks, not another planned session in the
     * same week. Scheduled future weeks are projections, not proof of completed training.
     */
    const spikeCap = (day, weekStart) => {
        const completedWeeks = workouts.filter(w => w.date < weekStart &&
            !['missed', 'failed'].includes(w.status));
        return running
            ? Math.floor(config.runSessionSpikeLimit * longestReference(day, completedWeeks, initialLongest,
                startDate, config, w => !['missed', 'failed'].includes(w.status), initialLongestDate))
            : Math.floor(config.cyclingSessionSpikeLimit * sessionReference(day, completedWeeks, initialLongest,
                initialLongestDate, config.cyclingSessionReferenceDays, config.cyclingInitialSessionMinutes));
    };
    const walkReference = state.activityCount ? state.longestRecentSessionMinutes || 0 : 0;
    for(const [weekIndex, week] of weeks.entries()) {
        let available = Array.from({length: daysBetween(week.startDate, week.endDate) + 1}, (_, i) =>
            addDays(week.startDate, i)).filter(d => profile.availableDays.includes(weekday(d)));
        const weekDays = Array.from({length: daysBetween(week.startDate, week.endDate) + 1}, (_, i) =>
            addDays(week.startDate, i));
        const taperDays = weekDays.filter(day => phases.some(p => p.type === 'taper' &&
            p.startDate <= day && day <= p.endDate)).length;
        if(taperDays) {
            const reference = scheduledHistory.filter(w => !['recovery', 'taper'].includes(w.phaseType)).at(-1) ??
                scheduledHistory.at(-1);
            const taperFactor = (weekDays.length - taperDays + taperDays * config.taperFactor) / 7;
            if(reference) {
                week.targetMinutes = Math.min(week.targetMinutes, Math.floor(reference.minutes * taperFactor));
                week.targetLoad = Math.min(week.targetLoad, round(reference.load * taperFactor));
            }
            week.phaseType = 'taper';
        }
        if(running && profile.experience === 'beginner') {
            available = limitRunDays(available, profile.longRideDay, config.runBeginnerMaximumDays);
        }
        // These novice run-walk stages are coaching heuristics, not a trial-validated progression.
        const runWalk = running && profile.experience === 'beginner' ? runWalkStage(walkReference, weekIndex, config) : null;
        // Allocate long-ride capacity first, then spread remaining minutes across other days.
        const ordered = [...available].sort((a, b) =>
            Number(weekday(b) === profile.longRideDay) - Number(weekday(a) === profile.longRideDay) || a.localeCompare(b));
        let budget = Math.min(week.targetMinutes,
            !scheduledHistory.length ? Infinity : Math.floor(Math.max(...scheduledHistory.slice(-4).map(w => w.minutes)) * (1 + week.rampLimit)));
        // Retain target load, the minutes ramp and session cap, but avoid a second load ramp that
        // forces minutes down as walk breaks phase out. This is not a validated injury-prevention rule.
        const loadBudget = Math.min(week.targetLoad, running || !scheduledHistory.length ? Infinity
            : Math.max(...scheduledHistory.slice(-4).map(w => w.load)) * (1 + week.rampLimit));
        const longShare = running ? Math.max(config.runLongRunShare, 1 / ordered.length) : config.longRideAllocationShare;
        const allocations = new Map();
        ordered.forEach((day, i) => {
            const long = weekday(day) === profile.longRideDay;
            const share = long && ordered.length > 1
                ? Math.ceil(budget * longShare) : Math.floor(budget / (ordered.length - i));
            const minutes = Math.min(profile.maxSessionMinutes[weekday(day)], share, spikeCap(day, week.startDate));
            allocations.set(day, minutes >= config.minimumSessionMinutes ? minutes : 0);
            budget -= minutes >= config.minimumSessionMinutes ? minutes : 0;
        });
        if(running && Number.isFinite(loadBudget)) {
            // Keep run frequency: when even easy running would exceed the ramp-limited load, shorten
            // every run proportionally instead of dropping the week's last sessions.
            const easyLoad = sum([...allocations.values()].filter(Boolean).map(m =>
                stepLoad(runSteps({family: 'endurance', minutes: m, runFormat: {runWalk}}, config))));
            const scale = easyLoad > 0 ? loadBudget / easyLoad : 1;
            if(scale < 1) {
                for(const [day, m] of allocations) {
                    const scaled = Math.floor(m * scale);
                    allocations.set(day, scaled >= config.minimumSessionMinutes ? scaled : 0);
                }
            }
        }
        const weeklyMinutes = qualityReferenceMinutes(weeks, weekIndex);
        let hardCount = 0, weekLoad = 0, stridesPlanned = false;
        for(const day of available) {
            // Re-check against every earlier session, including this week's, exactly as validatePlan does.
            const minutes = Math.min(allocations.get(day) || 0, spikeCap(day, week.startDate));
            if(minutes < config.minimumSessionMinutes) continue;
            const phase = phases.find(p => p.startDate <= day && p.endDate >= day);
            const long = weekday(day) === profile.longRideDay;
            // Taper: keep frequency and a short touch of intensity while volume falls (Bosquet et al. 2007).
            const taperQuality = phase.type === 'taper' && planDays >= config.taperQualityMinimumPlanDays &&
                daysBetween(day, eventDate) >= config.taperQualityMinimumDaysBeforeEvent && hardCount < 1;
            const canHard = (['build', 'specific', 'peak'].includes(phase.type) || taperQuality) &&
                hardCount < maxHard && minutes >= config.minimumHardSessionMinutes && !runWalk &&
                (lastHard == null || daysBetween(lastHard, day) >= config.minimumHardSeparationDays) && !long;
            const focus = phase.type === 'taper' ? candidates[0]?.capability ?? 'threshold' : nextFocus();
            const family = phase.type === 'recovery' || state.readiness.status === 'caution' ? 'recovery'
                : canHard ? focus : long && phase.type !== 'taper' ? 'durability' : 'endurance';
            const successful = state.successfulSessionsByFamily?.[family] || 0;
            const level = Math.min(config.progressionMaximumLevel,
                1 + Math.floor(successful / config.progressionSuccessfulSessionsPerLevel));
            const strides = running && !runWalk && !stridesPlanned && family === 'endurance' && !long
                ? ['build', 'specific', 'peak'].includes(phase.type) ? 6 : 4 : 0;
            const slot = {id: `${planId}:${day}`, date: day, minutes, family, level,
                phaseId: phase.id, weekId: week.id, phaseType: phase.type, profile, rules: config,
                ...(running ? {runFormat: {runWalk, strides}, weeklyMinutes} : {})};
            const options = {history: workouts, rules: config, allowTechnique: true, library: !running};
            let workout = prescribeWorkout(slot, options);
            // First use a lighter version of the same session, then reduce intensity, then duration;
            // never force the target into an unavailable day.
            if(weekLoad + workout.targetLoad > loadBudget && workout.libraryWorkoutId) {
                workout = progressWorkout(slot);
            }
            if(weekLoad + workout.targetLoad > loadBudget) {
                workout = prescribeWorkout({...slot, family: 'recovery', level: 1}, {...options, allowTechnique: false});
            }
            if(weekLoad + workout.targetLoad > loadBudget && workout.libraryWorkoutId) {
                workout = progressWorkout({...slot, family: 'recovery', level: 1});
            }
            if(weekLoad + workout.targetLoad > loadBudget) {
                const fitMinutes = Math.floor((loadBudget - weekLoad) /
                    (familySpec('recovery', sport).power ** 2 * 100) * 60);
                if(fitMinutes < config.minimumSessionMinutes) continue;
                workout = progressWorkout({...slot, id: workout.id, minutes: Math.min(minutes, fitMinutes),
                    family: 'recovery', level: 1});
            }
            if(FAMILIES[workout.family].hard) {
                hardCount++;
                lastHard = day;
                if(workout.family in focusCounts && phase.type !== 'taper') focusCounts[workout.family]++;
            }
            if(workout.runFormat?.strides) stridesPlanned = true;
            workouts.push(workout);
            weekLoad += workout.targetLoad;
        }
        // Run sessions concentrate quality time, so cap demanding time against the week actually scheduled.
        let scheduled = workouts.filter(w => w.weekId === week.id);
        const hardSeconds = () => sum(scheduled.flatMap(w => w.steps.filter(s => s.power > config.hardPowerThreshold))
            .map(s => s.duration));
        while(true) {
            const minutes = sum(scheduled.map(w => w.duration / 60));
            const totalExceeded = hardSeconds() > minutes * 60 * config.weeklyHardTimeShare;
            const excess = running ? runQualityExcess(scheduled, minutes, config) : [];
            if(!totalExceeded && !excess.length) break;
            const index = workouts.findLastIndex(w => w.weekId === week.id && FAMILIES[w.family].hard &&
                (totalExceeded || excess.includes(w.family)));
            if(index < 0) break;
            const hard = workouts[index];
            if(hard.family in focusCounts && hard.phaseId && phases.find(p => p.id === hard.phaseId)?.type !== 'taper') {
                focusCounts[hard.family]--;
            }
            workouts[index] = progressWorkout({id: hard.id, date: hard.date, minutes: hard.duration / 60,
                family: 'endurance', level: 1, phaseId: hard.phaseId, weekId: hard.weekId,
                phaseType: phases.find(p => p.id === hard.phaseId).type, profile, rules: config,
                ...(running ? {runFormat: {runWalk, strides: 0}, weeklyMinutes} : {})});
            scheduled = workouts.filter(w => w.weekId === week.id);
        }
        week.scheduledMinutes = sum(scheduled.map(w => w.duration / 60));
        week.scheduledLoad = round(sum(scheduled.map(w => w.targetLoad)));
        week.targetIntensityDistribution = intensityDistributionFor(scheduled, config, sport);
        scheduledHistory.push({minutes: week.scheduledMinutes, load: week.scheduledLoad, phaseType: week.phaseType});
    }

    return workouts;
}

/**
 * Ramp reference for a week: what was scheduled, or the originally validated dose when a
 * short-term adaptation scheduled less. Returning to the validated plan after a temporary
 * reduction is treated like returning from a recovery week, never as growth beyond it.
 *
 * @param {object} week - Plan week, optionally with `plannedMinutes`/`plannedLoad`.
 * @param {number} minutes - Minutes currently scheduled in the week.
 * @param {number} load - Load currently scheduled in the week.
 * @returns {{minutes: number, load: number}} Reference used by the next weeks' ramp ceiling.
 */
export function rampReference(week, minutes, load) {
    const planned = (value, target) => Number.isFinite(value) ? Math.min(value, target) : 0;
    return {
        minutes: Math.max(minutes, planned(week.plannedMinutes, week.targetMinutes)),
        load: Math.max(load, planned(week.plannedLoad, week.targetLoad)),
    };
}

const RUN_STRENGTH_ADVICE = 'Consider progressive strength training for running economy ' +
    '(Balsalobre-Fernández et al. 2016; Blagrove et al. 2018). Start conservatively, seek qualified guidance ' +
    'for unfamiliar heavy or plyometric exercises, and account for the extra fatigue; strength is not scheduled or tracked here.';

/**
 * @param {string|null} [asOf=null] - Adaptation date. Session spike caps apply only to scheduled sessions
 *   on or after it: completed sessions are history and overdue ones can no longer be reshaped.
 */
export function validatePlan(plan, profile, rules = plan.coachingConfig, asOf = null) {
    const config = validateCoachingConfig(rules);
    validateProfile(profile);
    const errors = [], warnings = [];
    if(plan.startDate >= plan.endDate || !plan.phases.length || !plan.weeks.length ||
       plan.phases[0].startDate !== plan.startDate || plan.phases.at(-1).endDate !== plan.endDate ||
       plan.phases.at(-1).type !== 'event' ||
       plan.phases.some((p, i) => p.startDate > p.endDate ||
           (i > 0 && p.startDate !== addDays(plan.phases[i - 1].endDate, 1)))) {
        errors.push('Invalid phase coverage.');
    }
    const ids = new Set(), dates = new Set();
    const hard = [];
    for(const w of plan.workouts) {
        if(ids.has(w.id) || dates.has(w.date)) errors.push('Duplicate workout identity or date.');
        ids.add(w.id); dates.add(w.date);
        if(w.date < plan.startDate || w.date >= plan.endDate) errors.push('Workout outside training dates.');
        const phase = plan.phases.find(p => p.id === w.phaseId);
        const week = plan.weeks.find(p => p.id === w.weekId);
        if(!phase || w.date < phase.startDate || w.date > phase.endDate ||
           !week || w.date < week.startDate || w.date > week.endDate) errors.push('Invalid phase/week relationship.');
        if(!profile.availableDays.includes(weekday(w.date)) ||
           w.duration / 60 > profile.maxSessionMinutes[weekday(w.date)]) errors.push('Workout exceeds daily availability.');
        if(!FAMILIES[w.family] || !['scheduled', 'completed', 'missed', 'failed', 'substituted'].includes(w.status) ||
           !Number.isFinite(w.duration) || w.duration < config.minimumSessionMinutes * 60 || !w.steps.length ||
           w.steps.some(s => !Number.isInteger(s.duration) || s.duration <= 0 ||
               !Number.isFinite(s.power) ||                s.power < 0 || s.power > config.libraryMaximumPower) ||
           sum(w.steps.map(s => s.duration)) !== w.duration ||
           !Number.isFinite(w.targetIntensity) ||
           Math.abs(w.targetIntensity - Math.sqrt(stepLoad(w.steps) / (w.duration / 3600 * 100))) > 0.001 ||
           Math.abs(stepLoad(w.steps) - w.targetLoad) > 0.02) errors.push('Invalid workout steps or target load.');
        if(FAMILIES[w.family]?.hard && !['missed', 'failed'].includes(w.status)) hard.push(w);
    }
    hard.sort((a, b) => a.date.localeCompare(b.date));
    if(hard.some((w, i) => i && daysBetween(hard[i - 1].date, w.date) < config.minimumHardSeparationDays)) errors.push('Hard workouts need an easy/rest day between.');
    const running = sportOf(profile) === 'running';
    const {minutes: initial, date: initialDate} = initialSessionReference(plan, config, running);
    const kept = plan.workouts.filter(w => !['missed', 'failed'].includes(w.status));
    const checked = kept.filter(w => w.status === 'scheduled' && (!asOf || w.date >= asOf));
    const priorWeeks = w => kept.filter(prior => prior.weekId !== w.weekId);
    if(running) {
        if(checked.some(w => w.duration / 60 > config.runSessionSpikeLimit *
            longestReference(w.date, priorWeeks(w), initial, plan.startDate, config, undefined, initialDate) + 0.01)) {
            errors.push('A run exceeds the longest run of the previous 30 days by more than the spike limit.');
        }
    } else if(checked.some(w => w.duration / 60 > config.cyclingSessionSpikeLimit * sessionReference(w.date,
        priorWeeks(w), initial, initialDate, config.cyclingSessionReferenceDays,
        config.cyclingInitialSessionMinutes) + 0.01)) {
        errors.push('A cycling session exceeds the recent-session progression cap.');
    }
    const history = [];
    for(const [index, week] of plan.weeks.entries()) {
        const workouts = plan.workouts.filter(w => w.weekId === week.id &&
            !['missed', 'failed'].includes(w.status));
        const minutes = sum(workouts.map(w => w.duration / 60));
        const load = sum(workouts.map(w => w.targetLoad));
        if(!Number.isFinite(week.targetMinutes) || week.targetMinutes < 0 ||
           !Number.isFinite(week.targetLoad) || week.targetLoad < 0 ||
           !Number.isFinite(week.rampLimit) || week.rampLimit < 0 || week.rampLimit > config.maxRamp ||
           minutes > profile.maxWeeklyHours * 60 || minutes > profile.typicalWeeklyHours * 60 ||
           minutes > week.targetMinutes + 0.01 || load > week.targetLoad + 0.05) errors.push('Weekly target or availability exceeded.');
        if(workouts.filter(w => FAMILIES[w.family]?.hard).length >
           (profile.experience === 'beginner' ? config.beginnerHardSessionsPerWeek : config.experiencedHardSessionsPerWeek)) errors.push('Too many hard workouts.');
        // Completed sessions are history: a share exceeded only by them (for example after the rest of
        // the week was missed) cannot be corrected, so only scheduled hard sessions make it an error.
        const scheduledHard = workouts.filter(w => w.status === 'scheduled' && FAMILIES[w.family]?.hard);
        const hardSeconds = sum(workouts.flatMap(w => w.steps.filter(s => s.power > config.hardPowerThreshold)).map(s => s.duration));
        if(scheduledHard.length && hardSeconds > minutes * 60 * config.weeklyHardTimeShare) errors.push('Weekly demanding interval time exceeded.');
        if(sportOf(profile) === 'running' &&
           runQualityExcess(workouts, minutes, config).some(family => scheduledHard.some(w => w.family === family))) {
            errors.push('Aggregate weekly running quality cap exceeded.');
        }
        if(history.length) {
            // The pre-plan envelope stays a reference, so a short early reduction cannot cap the whole plan.
            const reference = [plan.initialLimits, ...history].slice(-4);
            const minuteCeiling = Math.max(...reference.map(w => w.minutes)) * (1 + week.rampLimit) + 0.01;
            const loadCeiling = Math.max(...reference.map(w => w.load)) * (1 + week.rampLimit) + 0.05;
            if(minutes > minuteCeiling || (sportOf(profile) !== 'running' && load > loadCeiling)) {
                errors.push(`${week.id}: abrupt weekly progression exceeded (minutes ${round(minutes)}/${round(minuteCeiling)}, load ${round(load)}/${round(loadCeiling)}).`);
            }
        }
        if(!history.length && (minutes > plan.initialLimits.minutes + 0.01 ||
            load > plan.initialLimits.load + 0.05)) errors.push('Initial historical load envelope exceeded.');
        if(minutes < week.targetMinutes * 0.8) warnings.push(`${week.id}: target reduced to fit safe sessions and load.`);
        history.push(rampReference(week, minutes, load));
    }
    if(!plan.workouts.length) warnings.push('No safe session fits the supplied dates and availability.');
    if(sportOf(profile) === 'running' && plan.workouts.length) {
        const goal = plan.goalDefinition ?? {};
        const standardDistance = {first_5k: 5, run_5k: 5, run_10k: 10,
            half_marathon: 21.0975, marathon: 42.195}[goal.type];
        const distance = goal.distanceKm ?? standardDistance;
        const predicted = distance && profile.thresholdPace
            ? predictedRaceSeconds(profile.thresholdPace, distance, config.riegelExponent) / 60 : null;
        const race = goal.expectedDurationMinutes ?? goal.finishTimeMinutes ?? predicted;
        const longest = Math.max(...plan.workouts.map(w => w.duration / 60));
        if(race && longest < race * config.runRaceReadinessShare) {
            warnings.push(`Longest planned run (${Math.round(longest)} min) stays below ${Math.round(config.runRaceReadinessShare * 100)}% of the expected race time ` +
                `(about ${Math.round(race)} min): this plan may not provide enough endurance preparation. ` +
                'This is a heuristic, not a readiness assessment. Consider a shorter race, a later date, or qualified coaching advice.');
        }
        if(['first_5k', 'run_5k', 'run_10k', 'half_marathon', 'marathon', 'ultra_trail'].includes(goal.type) && !race) {
            warnings.push('Race readiness cannot be estimated from the available event and threshold-pace details; this plan does not establish race preparedness.');
        }
    }
    if(daysBetween(plan.startDate, plan.endDate) < 21) warnings.push('Short lead time: preparation and taper only, no accelerated build.');
    if(errors.length) throw new Error(`Unsafe plan: ${[...new Set(errors)].join(' ')}`);
    return [...new Set(warnings)];
}

/**
 * Run the whole planning pipeline, attach the exact inputs/rules and explanations, and validate the
 * result before returning it. Keep original generation warnings so later revisions cannot silently
 * drop them.
 */
export function generatePlan({profile, goal, state, startDate, generatedAt, registry = goalRegistry(sportOf(profile))}) {
    validateProfile(profile);
    const sport = sportOf(profile);
    const config = validateCoachingConfig(state.config);
    validateGoal(goal, startDate, registry, config);
    for(const key of ['ftpTestDate', 'thresholdPaceDate']) {
        if(profile[key] && profile[key] > startDate) {
            throw new Error(`${key} cannot be after the plan start date.`);
        }
    }
    if(state.date !== startDate || state.athleteId !== profile.id || !Number.isFinite(Date.parse(generatedAt))) {
        throw new Error('Plan requires a state snapshot for its start date and an explicit generation timestamp.');
    }
    const demand = modelGoalDemand(goal, registry, config), gaps = analyzeGaps(state, demand, goal);
    const id = `${profile.id}:${goal.id}:${startDate}:${state.id}`;
    const phases = periodise(startDate, goal, state, gaps);
    const weeks = weeklyTargets(startDate, goal, state, profile, phases);
    const workouts = scheduleWorkouts(weeks, phases, profile, state, gaps, id);
    for(const week of weeks) {
        week.plannedMinutes = week.scheduledMinutes;
        week.plannedLoad = week.scheduledLoad;
    }
    for(const phase of phases) {
        const members = workouts.filter(w => w.phaseId === phase.id);
        phase.targetVolumeRange = [0, sum(members.map(w => w.duration / 60))];
        phase.targetLoadRange = [0, round(sum(members.map(w => w.targetLoad)))];
        phase.targetIntensityDistribution = intensityDistributionFor(members, config, sport);
    }
    const plan = {
        id, athleteId: profile.id, goalId: goal.id, sport, startDate, endDate: goal.date, status: 'active',
        goalDefinition: JSON.parse(JSON.stringify(goal)),
        plannerVersion: VERSION, generatedAt, sourceSnapshot: state.id, revision: 1,
        coachingConfig: JSON.parse(JSON.stringify(config)),
        progressionBaseline: JSON.parse(JSON.stringify(state.successfulSessionsByFamily || {})),
        rationale: `${demand.rationale} ${gaps.rationale}${sport === 'running' ? ` ${RUN_STRENGTH_ADVICE}` : ''} Training decision support, not medical advice.`,
        demand, gaps, phases, weeks, workouts, adaptations: [], validationWarnings: [], generationWarnings: [],
        dataSufficiency: state.sufficiency,
        initialLimits: {minutes: weeks[0].targetMinutes, load: weeks[0].targetLoad,
            longestSessionMinutes: state.longestRecentSessionMinutes > 0
                ? Math.max(config.minimumSessionMinutes, state.longestRecentSessionMinutes) : sport === 'running'
                    ? config.runInitialLongestSessionMinutes : config.cyclingInitialSessionMinutes,
            longestSessionDate: state.longestRecentSessionDate || startDate},
    };
    plan.validationWarnings = validatePlan(plan, profile, config);
    const datedMetrics = sport === 'running'
        ? [['thresholdPace', 'thresholdPaceDate', 'Threshold pace']]
        : [['ftp', 'ftpTestDate', 'FTP']];
    // Input-quality warnings are kept separately so plan revisions do not silently drop them.
    for(const [metric, dateKey, label] of datedMetrics) {
        if(profile[metric] == null) continue;
        if(!profile[dateKey]) {
            plan.generationWarnings.push(`${label} measurement date is not recorded; verify this value before relying on its intensity targets.`);
        } else if(daysBetween(profile[dateKey], startDate) > 90) {
            plan.generationWarnings.push(`${label} measurement is over 90 days old; verify or recalibrate it before relying on its intensity targets. The 90-day reminder is a heuristic, not a physiological validity cutoff.`);
        }
    }
    if(sport === 'running' && ['first_5k', 'run_5k', 'run_10k', 'half_marathon', 'marathon', 'ultra_trail'].includes(goal.type) &&
       state.sufficiency !== 'supported') {
        plan.generationWarnings.push('Recent running history is insufficient to assess race preparation. This conservative plan is not evidence of readiness; consider a later or shorter event and qualified coaching advice.');
    }
    plan.validationWarnings.push(...plan.generationWarnings);
    return plan;
}
