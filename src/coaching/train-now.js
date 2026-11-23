/**
 * "Train Now": choose one ad-hoc session for the current moment, independent of the calendar and
 * any workout planned for today. It reads the athlete profile, goal, recent completed sessions,
 * readiness/load estimates and the Coach's configured rules, then asks the existing library
 * prescriber for a fitting session. It never writes to the plan, calendar or workout library.
 *
 * This is decision support built from the same heuristics as the planned Coach, not a diagnosis or
 * a guarantee that the session is optimal. The explanation is stored with the returned workout so
 * the ride screen and recorded activity can show why it was chosen.
 */

import { DEFAULTS, GOALS, date, daysBetween, goalRegistry, sportOf, weekday, validateCoachingConfig } from './domain.js';
import { estimateState } from './state.js';
import { FAMILIES } from './workouts.js';
import { prescribeWorkout } from './library.js';

const COMPLETED = ['completed', 'substituted'];
const RECENT_DAYS = 10;

const FAMILY_LABELS = {
    recovery: 'recovery ride',
    endurance: 'endurance ride',
    threshold: 'threshold session',
    aerobic: 'VO2 max session',
    sprint: 'sprint session',
    durability: 'long endurance ride',
};

const isHardFamily = family => FAMILIES[family]?.hard === true;
const isFinitePositive = value => Number.isFinite(value) && value > 0;

/**
 * Translate a completed activity without a matching planned session into an approximate family.
 * A plan match is always preferred because it knows the intended session; otherwise use recorded
 * intensity or perceived effort, and treat everything else as endurance.
 */
function activityFamily(activity, profile, planByActivity, rules) {
    const planned = planByActivity.get(String(activity.id));
    if(planned?.family && FAMILIES[planned.family]) return planned.family;
    if(activity.sport !== 'cycling') return null;
    const intensity = Number.isFinite(activity.intensityFactor) ? activity.intensityFactor
        : isFinitePositive(profile.ftp) && Number.isFinite(activity.normalizedPower)
            ? activity.normalizedPower / profile.ftp
            : isFinitePositive(profile.ftp) && Number.isFinite(activity.averagePower)
                ? activity.averagePower / profile.ftp : null;
    if(intensity != null && intensity >= rules.hardPowerThreshold) return 'threshold';
    if(Number.isFinite(activity.rpe) && activity.rpe >= 7) return 'threshold';
    return 'endurance';
}

/**
 * Collect completed sessions before the chosen day. Today's planned workout is deliberately
 * excluded, as are future sessions: Train Now reasons from what has actually happened.
 */
function recentSessions(data, asOf, rules) {
    const workouts = (data.plan?.workouts || []).filter(workout => workout.date <= asOf);
    const planByActivity = new Map(workouts
        .filter(workout => workout.matchedActivity != null)
        .map(workout => [String(workout.matchedActivity), workout]));
    const sessions = workouts.filter(workout => COMPLETED.includes(workout.status))
        .map(workout => ({date: workout.date, family: workout.family,
            hard: isHardFamily(workout.family), source: 'plan'}));
    const counted = new Set(workouts.filter(workout => workout.matchedActivity != null)
        .map(workout => String(workout.matchedActivity)));
    for(const activity of data.activities || []) {
        if(activity.day > asOf || counted.has(String(activity.id))) continue;
        const family = activityFamily(activity, data.profile, planByActivity, rules);
        if(!family) continue;
        sessions.push({date: activity.day, family, hard: isHardFamily(family), source: 'activity'});
    }
    sessions.sort((a, b) => a.date.localeCompare(b.date));
    return sessions.filter(session => daysBetween(session.date, asOf) <= RECENT_DAYS);
}

/**
 * Build the resolved outcomes the state estimator uses for progression and adherence. This mirrors
 * the planned Coach's snapshot inputs without creating or changing a snapshot.
 */
function outcomes(data) {
    return (data.plan?.workouts || []).filter(workout => workout.status !== 'scheduled').map(workout =>
        ({date: workout.date, status: workout.status, quality: workout.completionQuality,
            family: workout.family, activityId: workout.matchedActivity ?? null,
            expectedRpe: workout.expectedRpe ?? null,
            progressionEligible: workout.progressionEligible ?? false}));
}

/**
 * Pick a hard family using the goal's capability weights and recent variety. A session repeated in
 * the last few days is penalised; the goal still decides which quality matters most.
 */
function chooseHardFamily(goal, sessions) {
    const weights = goalRegistry('cycling')[goal?.type] || GOALS.general_fitness;
    const uses = family => sessions.filter(session => session.family === family).length;
    const last = sessions.at(-1)?.family;
    return [
        ['threshold', weights[1]],
        ['aerobic', weights[2]],
        ['sprint', weights[3]],
    ].map(([family, weight], order) => ({
        family, order,
        score: weight * 10 - uses(family) * 3 - (last === family ? 2 : 0),
    })).sort((a, b) => b.score - a.score || a.order - b.order)[0].family;
}

/** Choose today's available duration without inventing time beyond the profile or recent history. */
function chooseMinutes(profile, state, rules, day) {
    const configured = Number(profile.maxSessionMinutes?.[day]);
    const typical = Math.round(profile.typicalWeeklyHours * 60 /
        Math.max(1, profile.availableDays?.length || 1));
    let minutes = isFinitePositive(configured) ? configured : isFinitePositive(typical) ? typical : 60;
    if(isFinitePositive(state.longestRecentSessionMinutes)) {
        minutes = Math.min(minutes,
            Math.max(rules.minimumSessionMinutes, Math.round(state.longestRecentSessionMinutes * rules.cyclingSessionSpikeLimit)));
    }
    minutes = Math.round(minutes / 5) * 5;
    return Math.min(1440, Math.max(rules.minimumSessionMinutes, minutes));
}

/** Turn the chosen signals into a compact, readable explanation without medical claims. */
function explain({family, minutes, level, state, sessions, lastHard,
    missedRecent, phaseType, goal, rules}) {
    const label = FAMILY_LABELS[family] || family;
    const labelStart = label[0].toUpperCase() + label.slice(1);
    const reasons = [];
    const acute = Number.isFinite(state.acuteLoad) ? state.acuteLoad : null;
    const chronic = isFinitePositive(state.chronicLoad) ? state.chronicLoad : null;
    const ratio = acute != null && chronic ? acute / chronic : null;

    if(state.readiness?.status === 'caution') {
        const concerns = (state.readiness.concerns || []).slice(0, 2).join('; ');
        reasons.push(`your recent subjective signals reached the Coach's caution threshold${concerns ? ` (${concerns})` : ''}`);
    }
    if(ratio != null && ratio >= 1.6) {
        reasons.push(`your 7-day load is about ${Math.round((ratio - 1) * 100)}% above your 42-day baseline`);
    } else if(ratio != null && ratio >= 1.35) {
        reasons.push('your recent load is elevated relative to your baseline');
    }
    if(chronic && Number.isFinite(state.rampRate) && state.rampRate / chronic > rules.maxRamp) {
        reasons.push('your load has risen faster than the configured ramp limit');
    }
    if(missedRecent >= 2) {
        reasons.push(`${missedRecent} recent planned sessions were missed, so today's dose stays conservative`);
    }
    if(Number.isFinite(state.recentRpeTrend?.value) && state.recentRpeTrend.value >= 1) {
        reasons.push('recent perceived exertion is trending upward');
    }
    if(Number.isFinite(state.completionRate?.value) && state.completionRate.value < 0.7) {
        reasons.push("recent planned-session completion is below the Coach's conservative threshold");
    }
    if(state.sufficiency === 'insufficient') {
        reasons.push('there is not enough recent training history for a confident hard prescription');
    } else if(state.sufficiency === 'limited') {
        reasons.push('recent history is limited, so the session stays conservative');
    }
    if(phaseType === 'recovery' || phaseType === 'taper') {
        reasons.push(`the current Coach phase is ${phaseType}, which keeps intensity low`);
    }
    if(isHardFamily(family)) {
        const lastTwo = sessions.slice(-2).map(session => FAMILY_LABELS[session.family] || session.family);
        if(lastTwo.length) reasons.push(`your last completed ${lastTwo.length === 1 ? 'session was' : 'sessions were'} ${lastTwo.join(' and ')}`);
        if(lastHard != null) reasons.push(`the last hard session was ${lastHard} day${lastHard === 1 ? '' : 's'} ago`);
        else reasons.push('you have no recent hard session on record');
    }
    if(!reasons.length) {
        reasons.push('your recent training and readiness do not call for a change from steady aerobic work');
    }

    const goalText = goal?.name ? ` It supports your goal, ${goal.name}.` : '';
    return `${labelStart} selected for ${minutes} minutes${level > 1 ? ` at progression level ${level}` : ''}: ${reasons.join('; ')}.${goalText} This session was generated independently of today's calendar.`.slice(0, 900);
}

/**
 * Generate the most suitable ad-hoc cycling session for the current moment.
 *
 * @param {{data: object, asOf: string}} args - Coach data and the rider's local day (YYYY-MM-DD).
 * @returns {{workout: object, reasoning: string, signals: object}} The session and its explanation.
 */
export function trainNowWorkout({data, asOf} = {}) {
    if(!data?.profile) throw new Error('Set up your Coach profile before using Train Now.');
    const profile = data.profile;
    if(sportOf(profile) !== 'cycling') {
        throw new Error('Train Now starts indoor cycling sessions. Running guidance stays in the calendar and Coach.');
    }
    if(profile.adultAthleteConfirmed !== true) {
        throw new Error('Confirm that the athlete is 18 or older in Coach before using Train Now.');
    }
    if(!isFinitePositive(profile.ftp)) {
        throw new Error('Set a valid FTP in Coach before using Train Now.');
    }
    if(data.safetyStatus || data.plan?.trainingPaused) {
        throw new Error('Training is paused while pain or illness is reported. Update your symptom status in Coach.');
    }
    date(asOf);
    const rules = validateCoachingConfig(data.plan?.coachingConfig ?? data.snapshots?.at(-1)?.config ?? DEFAULTS);
    const state = estimateState(data.activities || [], profile, asOf, rules, outcomes(data));
    const sessions = recentSessions(data, asOf, rules);
    const day = weekday(asOf);

    const plan = data.plan?.status === 'active' ? data.plan : null;
    const phase = plan?.phases?.find(item => item.startDate <= asOf && item.endDate >= asOf);
    const phaseType = phase?.type ?? (state.sufficiency === 'insufficient' ? 'assessment'
        : state.sufficiency === 'limited' ? 'base' : 'build');

    const hardSessions = sessions.filter(session => session.hard);
    const lastHardDate = hardSessions.at(-1)?.date ?? null;
    const lastHard = lastHardDate ? daysBetween(lastHardDate, asOf) : null;
    const hardThisWeek = hardSessions.filter(session => daysBetween(session.date, asOf) < 7).length;
    const missedRecent = (data.plan?.workouts || []).filter(workout => workout.date <= asOf &&
        daysBetween(workout.date, asOf) <= 7 && ['missed', 'failed'].includes(workout.status)).length;
    const acute = Number.isFinite(state.acuteLoad) ? state.acuteLoad : null;
    const chronic = isFinitePositive(state.chronicLoad) ? state.chronicLoad : null;
    const ratio = acute != null && chronic ? acute / chronic : null;
    const highLoad = ratio != null && ratio >= 1.6;
    const elevatedLoad = ratio != null && ratio >= 1.35;
    const highRamp = Boolean(chronic && Number.isFinite(state.rampRate) && state.rampRate / chronic > rules.maxRamp);
    const maxHard = profile.experience === 'beginner'
        ? rules.beginnerHardSessionsPerWeek : rules.experiencedHardSessionsPerWeek;
    const risingEffort = Number.isFinite(state.recentRpeTrend?.value) && state.recentRpeTrend.value >= 1;
    const lowCompletion = Number.isFinite(state.completionRate?.value) && state.completionRate.value < 0.7;
    const minutes = chooseMinutes(profile, state, rules, day);
    const goal = plan?.goalDefinition || data.goal || null;

    const hardAllowed = state.sufficiency === 'supported' && !elevatedLoad && !highRamp &&
        !risingEffort && !lowCompletion && !['recovery', 'taper'].includes(phaseType) && missedRecent < 2 &&
        minutes >= rules.minimumHardSessionMinutes && hardThisWeek < maxHard &&
        (lastHard == null || lastHard >= rules.minimumHardSeparationDays);
    const recovery = state.readiness?.status === 'caution' || highLoad;
    const family = recovery ? 'recovery' : hardAllowed ? chooseHardFamily(goal, sessions) : 'endurance';
    const successful = state.successfulSessionsByFamily?.[family] ?? 0;
    const level = family === 'recovery' ? 1 : Math.min(rules.progressionMaximumLevel,
        1 + Math.floor(successful / rules.progressionSuccessfulSessionsPerLevel));

    const slot = {
        id: `train-now:${profile.id}:${asOf}:${family}:${minutes}:${level}`,
        date: asOf, minutes, family, level, phaseType, profile, rules,
    };
    const history = (data.plan?.workouts || []).filter(workout => workout.date <= asOf);
    const workout = prescribeWorkout(slot, {history, rules, allowTechnique: family === 'endurance'});
    const reasoning = explain({family: workout.family, minutes: workout.duration / 60, level,
        state, sessions, lastHard, missedRecent, phaseType, goal, rules});
    const signals = {
        family: workout.family, requestedFamily: family, minutes: workout.duration / 60, level,
        readiness: state.readiness?.status ?? 'unknown', sufficiency: state.sufficiency,
        acuteLoad: acute, chronicLoad: chronic, acuteRatio: ratio, rampRate: state.rampRate ?? null,
        hardThisWeek, daysSinceHard: lastHard, missedRecent, phaseType,
        recentRpeTrend: state.recentRpeTrend?.value ?? null,
        completionRate: state.completionRate?.value ?? null,
        recentFamilies: sessions.slice(-3).map(session => session.family),
        goal: goal?.type ?? null, ignoredPlannedWorkout: true,
    };
    workout.title = `Train Now · ${workout.title}`;
    workout.trainNow = {reasoning, signals, generatedAt: new Date().toISOString()};
    return {workout, reasoning, signals};
}
