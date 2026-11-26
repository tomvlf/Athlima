/**
 * Coordinates the local Coach: saved history -> a dated summary of the athlete -> a plan ->
 * revisions after new information. "State" is the full saved set of data; a "snapshot" records what
 * was known at a date; a "revision" preserves an earlier plan. This service uses browser storage,
 * not a remote AI. Methods that save return Promises and must be awaited before reporting success.
 */

import { VERSION, DEFAULTS, addDays, localDay, sportOf, goalRegistry, validateProfile,
    validateGoal, validateCoachingConfig, date } from './domain.js';
import { normalizeActivity } from './normalizer.js';
import { estimateState } from './state.js';
import { generatePlan } from './planner.js';
import { matchWorkout, adaptPlan, intervalsVerified } from './adaptation.js';
import { openCoachingStorage } from './storage.js';
import { FAMILIES } from './workouts.js';

const KEY = 'too-many-watts-coaching-v1';
const empty = () => ({version: VERSION, profile: null, goal: null, activities: [],
    snapshots: [], revisions: [], plan: null, safetyStatus: null, microcycleReviews: []});

/**
 * Stores the athlete profile, training goal, imported activities, and generated plan.
 *
 * This service is the central coaching state container for Too Many Watts. It keeps the rider's
 * profile and plan together in one JSON object so the planner, activity importer, and UI
 * can all read a single consistent state instead of separate fragmented stores.
 */
export class CoachingService {
    /**
     * Creates a coaching state manager bound to a storage implementation.
     *
     * @param {{getItem: Function, setItem: Function}} storage - Persistence layer for the coached athlete state.
     * @param {Function} [clock=() => new Date().toISOString()] - Clock used to generate timestamps and local-day checks.
     */
    constructor(storage, clock = () => new Date().toISOString(), rules = DEFAULTS) {
        this.storage = storage;
        this.clock = clock;
        this.rules = validateCoachingConfig(rules);
        const stored = storage.getItem(KEY);
        this.data = stored ? JSON.parse(stored) : empty();
        if(this.data.version !== VERSION || !Array.isArray(this.data.activities) ||
           !Array.isArray(this.data.snapshots) || !Array.isArray(this.data.revisions)) {
            throw new Error('Unsupported or corrupt coaching storage; export or repair it before continuing.');
        }
        this.data.safetyStatus ??= null;
        if(!Array.isArray(this.data.microcycleReviews)) this.data.microcycleReviews = [];
    }
    /**
     * Persists the next coaching state and swaps the runtime state only after a successful write.
     *
     * @param {object} next - The full coaching state object to store.
     * @returns {Promise<object>} The just-saved and active state snapshot.
     */
    async commit(next) {
        // A single atomic storage write: failure leaves the prior in-memory revision intact.
        if(this.saving) throw new Error('Another coaching update is saving; retry when it finishes.');
        this.saving = true;
        try {
            await this.storage.setItem(KEY, JSON.stringify(next));
            this.data = next;
            return next;
        } finally {
            this.saving = false;
        }
    }
    /**
     * Saves the rider profile and dated goal and blocks invalid or mismatched athlete data.
     *
     * @param {object} profile - Athlete profile including FTP, availability, and limits.
     * @param {object} goal - Active training goal with priority, date, and objectives.
     * @returns {Promise<object>} Updated coaching state with the athlete configuration applied.
     */
    async configure(profile, goal) {
        validateProfile(profile);
        if(profile.adultAthleteConfirmed !== true) throw new Error('The coaching plan is designed for adults; confirm that the athlete is 18 or older.');
        if(this.data.plan?.status === 'active') throw new Error('Finish or archive the current plan before changing profile or goal.');
        if(this.data.activities.length && this.data.profile && this.data.profile.id !== profile.id) throw new Error('Existing coaching history belongs to a different athlete.');
        const activities = this.data.activities.map(activity => normalizeActivity({
            ...activity.original, providerIds: activity.providerIds,
            rpe: activity.rpe, feedback: activity.feedback,
        }, profile));
        return this.commit({...this.data, activities, profile: JSON.parse(JSON.stringify(profile)),
            goal: JSON.parse(JSON.stringify(goal))});
    }
    /**
     * Build a read-only preview for a simple goal/profile change. It does not archive or alter
     * the live plan and can be discarded without creating a revision.
     *
     * @param {object} input - New sport, goal and profile.
     * @returns {object} Stable preview with source revisions and candidate plan.
     */
    previewQuickGoal({profile, goal}) {
        validateProfile(profile);
        const sport = sportOf(profile);
        validateGoal(goal, this.data.plan?.startDate || date(localDay(this.clock(), profile.timeZone)),
            goalRegistry(sport), this.rules);
        if(goal.type && !Object.hasOwn(goalRegistry(sport), goal.type)) {
            throw new Error('The selected goal is not supported for this sport.');
        }
        const next = JSON.parse(JSON.stringify(this.data));
        next.profile = JSON.parse(JSON.stringify(profile));
        next.goal = JSON.parse(JSON.stringify(goal));
        const today = date(localDay(this.clock(), profile.timeZone));
        const state = estimateState(next.activities, profile, today, this.rules,
            next.plan?.workouts.filter(workout => workout.status !== 'scheduled').map(workout =>
                ({date: workout.date, status: workout.status, quality: workout.completionQuality,
                    family: workout.family, activityId: workout.matchedActivity,
                    expectedRpe: workout.expectedRpe, progressionEligible: workout.progressionEligible})) || []);
        state.safetyStatus = next.safetyStatus;
        state.id += `:${next.snapshots.length + 1}`;
        const startDate = next.plan?.startDate || today;
        const candidate = generatePlan({profile, goal, state,
            startDate, generatedAt: this.clock()});
        candidate.id = next.plan?.id || candidate.id;
        candidate.revision = (next.plan?.revision || 0) + 1;
        candidate.sourceSnapshot = state.id;
        const before = next.plan?.workouts || [];
        const after = candidate.workouts || [];
        const beforeMap = new Map(before.map(workout => [workout.id, workout]));
        const afterMap = new Map(after.map(workout => [workout.id, workout]));
        const changes = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort()
            .flatMap(id => {
                const previous = beforeMap.get(id) || null;
                const current = afterMap.get(id) || null;
                if(JSON.stringify(previous) === JSON.stringify(current)) return [];
                return [{workoutId: id,
                    action: !previous ? 'added' : !current ? 'removed' : 'modified',
                    previous, current}];
            });
        return {
            source: {
                planId: next.plan?.id || null,
                revision: next.plan?.revision || 0,
                goalId: this.data.goal?.id || null,
            },
            profile,
            goal,
            state,
            candidate,
            changes,
            warnings: candidate.validationWarnings || [],
            forecast: {
                beforeMinutes: before.reduce((total, workout) => total + workout.duration / 60, 0),
                afterMinutes: after.reduce((total, workout) => total + workout.duration / 60, 0),
                beforeLoad: before.reduce((total, workout) => total + (workout.targetLoad || 0), 0),
                afterLoad: after.reduce((total, workout) => total + (workout.targetLoad || 0), 0),
            },
        };
    }
    /**
     * Atomically create or replace the Coach plan after a quick goal preview.
     * Rebuilds the candidate before commit so stale or tampered previews are rejected.
     */
    async acceptQuickGoal(preview) {
        if(!preview?.source || !preview.profile || !preview.goal || !preview.candidate) {
            throw new Error('A complete quick-goal preview is required.');
        }
        if((this.data.plan?.id || null) !== preview.source.planId ||
           (this.data.plan?.revision || 0) !== preview.source.revision ||
           (this.data.goal?.id || null) !== preview.source.goalId) {
            throw new Error('The quick-goal preview is stale. Build a new preview.');
        }
        const rebuilt = this.previewQuickGoal({profile: preview.profile, goal: preview.goal});
        if(JSON.stringify(rebuilt.candidate) !== JSON.stringify(preview.candidate) ||
           JSON.stringify(rebuilt.changes) !== JSON.stringify(preview.changes)) {
            throw new Error('The quick-goal preview changed. Build a new preview.');
        }
        const next = JSON.parse(JSON.stringify(this.data));
        next.profile = JSON.parse(JSON.stringify(preview.profile));
        next.goal = JSON.parse(JSON.stringify(preview.goal));
        next.activities = next.activities.map(activity => normalizeActivity({
            ...activity.original,
            providerIds: activity.providerIds,
            rpe: activity.rpe,
            feedback: activity.feedback,
        }, next.profile));
        if(next.plan) {
            next.plan.status = 'archived';
            next.revisions.push(JSON.parse(JSON.stringify(next.plan)));
        }
        const startDate = next.plan?.startDate || date(localDay(this.clock(), next.profile.timeZone));
        const state = this.snapshot(next, date(localDay(this.clock(), next.profile.timeZone)));
        const candidate = generatePlan({profile: next.profile, goal: next.goal, state,
            startDate, generatedAt: this.clock()});
        candidate.id = preview.candidate.id;
        candidate.revision = preview.candidate.revision;
        candidate.sourceSnapshot = state.id;
        next.plan = candidate;
        next.revisions.push(JSON.parse(JSON.stringify(candidate)));
        next.microcycleReviews = [];
        await this.commit(next);
        return {plan: this.data.plan, state, preview: rebuilt};
    }
    /**
     * Captures a training-state snapshot at a specific date for planning and historical comparison.
     *
     * @param {object} data - Current coaching state.
     * @param {string} asOf - Date string representing the snapshot date.
     * @param {object|null} [outcome=null] - Optional workout completion outcome to fold into the state.
     * @returns {object} Derived athlete state used to generate or adapt a plan.
     */
    snapshot(data, asOf, outcome = null) {
        const outcomes = data.plan?.workouts.filter(w => w.status !== 'scheduled').map(w =>
            ({date: w.date, status: w.status, quality: w.completionQuality, family: w.family,
                activityId: w.matchedActivity ?? null, expectedRpe: w.expectedRpe ?? null,
                progressionEligible: w.progressionEligible ?? false})) || [];
        if(outcome) outcomes.push(outcome);
        const state = estimateState(data.activities, data.profile, asOf, this.rules, outcomes);
        state.safetyStatus = data.safetyStatus;
        state.id += `:${data.snapshots.length + 1}`;
        data.snapshots.push(state);
        return state;
    }
    /**
     * Creates a fresh training plan from the configured athlete and goal.
     *
     * @param {string} startDate - Plan start date in YYYY-MM-DD format.
     * @returns {Promise<object>} The generated plan object.
     */
    async generate(startDate) {
        const next = JSON.parse(JSON.stringify(this.data));
        if(!next.profile || !next.goal) throw new Error('Configure an athlete and dated goal first.');
        if(next.profile.adultAthleteConfirmed !== true) throw new Error('Confirm that the athlete is 18 or older before generating a plan.');
        if(next.safetyStatus) throw new Error('Training is paused while pain or illness is reported. Update the symptom status before generating a plan.');
        if(next.plan?.status === 'active') throw new Error('Archive the current plan before generating another.');
        const state = this.snapshot(next, date(startDate));
        next.plan = generatePlan({profile: next.profile, goal: next.goal, state,
            startDate, generatedAt: this.clock()});
        next.revisions.push(JSON.parse(JSON.stringify(next.plan)));
        next.microcycleReviews = [];
        return (await this.commit(next)).plan;
    }
    /**
     * Marks the current active plan as archived so it stops being considered live.
     *
     * @returns {Promise<object>} Updated coaching state with the plan moved to archived status.
     */
    async archive() {
        if(!this.data.plan) throw new Error('No plan to archive.');
        const next = JSON.parse(JSON.stringify(this.data));
        next.plan.status = 'archived';
        next.revisions.push(JSON.parse(JSON.stringify(next.plan)));
        next.microcycleReviews = [];
        return this.commit(next);
    }
    /**
     * Persist only the minimal status of a microcycle review fingerprint. Candidate plans,
     * snapshots and availability details are never stored by this method.
     *
     * @param {object|null} trigger - Trigger returned by microcycleReviewTrigger().
     * @param {'dismissed'|'seen'} status - Minimal review status.
     * @returns {Promise<object>} Updated coaching state.
     */
    async setMicrocycleReviewStatus(trigger, status) {
        if(!trigger?.fingerprint || !['dismissed', 'seen'].includes(status)) {
            throw new Error('A valid microcycle review trigger and status are required.');
        }
        const plan = this.data.plan;
        if(!plan) return this.data;
        const next = JSON.parse(JSON.stringify(this.data));
        next.microcycleReviews = (next.microcycleReviews || []).filter(entry =>
            entry.fingerprint !== trigger.fingerprint);
        next.microcycleReviews.push({
            fingerprint: trigger.fingerprint,
            status,
            dismissedAt: status === 'dismissed' ? this.clock() : null,
            planId: plan.id,
            revision: plan.revision,
        });
        next.microcycleReviews = next.microcycleReviews.slice(-50);
        await this.commit(next);
        return this.data;
    }
    /**
     * Persist a pain/illness report or clear it. An active plan is adjusted and marked paused while
     * a report is present. Clearing a report is not medical clearance and does not prove the
     * athlete is ready.
     */
    async setSafetyStatus(status, asOf) {
        if(status !== null && !['pain', 'illness'].includes(status)) {
            throw new Error('Safety status must be pain, illness, or null.');
        }
        if(status === this.data.safetyStatus) return this.data;
        const next = JSON.parse(JSON.stringify(this.data));
        next.safetyStatus = status;
        if(next.plan?.status === 'active') {
            const today = date(asOf || localDay(this.clock(), next.profile.timeZone));
            const adaptationDate = today >= next.plan.endDate ? addDays(next.plan.endDate, -1) : today;
            if(adaptationDate >= next.plan.startDate) {
                const state = this.snapshot(next, adaptationDate);
                next.plan = adaptPlan({plan: next.plan, profile: next.profile, state,
                    trigger: 'recovery', date: adaptationDate, timestamp: this.clock()});
            }
            next.plan.trainingPaused = status !== null;
            next.revisions.push(JSON.parse(JSON.stringify(next.plan)));
        }
        return this.commit(next);
    }
    /**
     * Imports raw provider activity data and normalizes it into Too Many Watts's internal activity model.
     *
     * @param {Array<object>} rawActivities - Raw ride records from a provider like Intervals.icu.
     * @returns {Promise<object>} Updated coaching state with the imported activities applied.
     */
    async importActivities(rawActivities) {
        if(!Array.isArray(rawActivities)) throw new Error('Activity import must be a JSON array.');
        // Validate the entire batch before committing any of it.
        const normalized = rawActivities.map(raw => normalizeActivity(raw, this.data.profile || undefined));
        const next = JSON.parse(JSON.stringify(this.data));
        const added = [];
        let refreshed = false;
        const evidence = value => JSON.stringify({...value, syncedAt: null,
            original: {...value.original, syncedAt: null}});
        for(const activity of normalized) {
            const index = next.activities.findIndex(a => a.id === activity.id);
            if(index !== -1) {
                const previous = next.activities[index];
                if(previous.source === 'too-many-watts' && activity.source === 'intervals') {
                    next.activities[index] = {...previous, providerIds: {...previous.providerIds, ...activity.providerIds},
                        syncedAt: activity.syncedAt};
                    continue;
                }
                // Provider refreshes must not erase the rider's subjective feedback or re-complete a session.
                if(activity.source !== 'manual' && previous.source === activity.source &&
                   previous.externalId === activity.externalId) {
                    const updated = normalizeActivity({...activity.original,
                        rpe: previous.rpe ?? activity.rpe,
                        feedback: Object.fromEntries(Object.keys(previous.feedback).map(key =>
                            [key, previous.feedback[key] ?? activity.feedback[key]]))},
                    next.profile || undefined);
                    const coached = sportOf(next.profile);
                    if((previous.sport === coached || updated.sport === coached) &&
                       evidence(previous) !== evidence(updated)) refreshed = true;
                    next.activities[index] = updated;
                }
                continue;
            }
            next.activities.push(activity);
            added.push(activity);
        }
        if(next.plan?.status === 'active') {
            const today = [localDay(this.clock(), next.profile.timeZone), next.plan.endDate].sort()[0];
            if(today >= next.plan.startDate) {
                for(const activity of added.filter(a => a.day <= today && a.day >= next.plan.startDate)) {
                    this.applyActivity(next, activity, today);
                }
                if(refreshed || added.some(a => a.sport === sportOf(next.profile) && a.day < next.plan.startDate)) {
                    const state = this.snapshot(next, today);
                    next.plan = adaptPlan({plan: next.plan, profile: next.profile, state,
                        trigger: 'feedback', date: today, timestamp: this.clock()});
                    next.revisions.push(JSON.parse(JSON.stringify(next.plan)));
                }
            }
        }
        return this.commit(next);
    }
    /**
     * Applies a completed ride to the active plan and updates the plan adaptation state.
     *
     * @param {object} next - Coaching state being mutated.
     * @param {object} activity - Normalized ride being applied.
     * @param {string} asOf - Date when the ride was considered complete.
     * @param {string|null} [explicitId=null] - Optional workout ID when the rider explicitly matches a workout.
     */
    applyActivity(next, activity, asOf, explicitId = null) {
        if(activity.sport !== sportOf(next.profile) || activity.day > asOf || activity.day < next.plan.startDate) return;
        const match = matchWorkout(activity, next.plan.workouts, explicitId, this.rules);
        const matched = next.plan.workouts.find(w => w.id === match.workoutId);
        const state = this.snapshot(next, asOf, matched
            ? {date: activity.day, status: 'completed', quality: match.quality, family: matched.family,
                activityId: activity.id, expectedRpe: matched.expectedRpe ?? null,
                progressionEligible: match.progressionEligible} : null);
        next.plan = adaptPlan({plan: next.plan, profile: next.profile, state,
            trigger: match.workoutId ? 'completed' : 'unplanned', date: asOf,
            timestamp: this.clock(), workoutId: match.workoutId, activity,
            match: match.workoutId ? match : null});
        next.revisions.push(JSON.parse(JSON.stringify(next.plan)));
    }
    /**
     * Records a freshly created ride and tries to map it to the active coaching plan.
     *
     * @param {object} raw - Ride payload from the app or a provider.
     * @param {string|null} [explicitId=null] - Optional explicit workout ID when the rider matched a planned session.
     * @returns {Promise<object|null>} The active plan after the ride is recorded.
     */
    async recordRide(raw, explicitId = null) {
        const existing = this.data.activities.find(a => a.id === String(raw.id));
        if(existing) {
            if(existing.source === 'intervals' && raw.source === 'too-many-watts') {
                const next = JSON.parse(JSON.stringify(this.data));
                next.activities[next.activities.findIndex(a => a.id === existing.id)] =
                    normalizeActivity({...raw, providerIds: existing.providerIds}, this.data.profile || undefined);
                await this.commit(next);
            }
            return this.data.plan;
        }
        const activity = normalizeActivity(raw, this.data.profile || undefined);
        const next = JSON.parse(JSON.stringify(this.data));
        next.activities.push(activity);
        // A Train Now ride is ad-hoc by design: keep it in history and load, but never let it
        // reschedule or adapt the active plan.
        if(next.plan?.status === 'active' && raw.trainNow !== true) {
            const asOf = localDay(this.clock(), next.profile.timeZone);
            if(asOf >= next.plan.startDate && asOf <= next.plan.endDate) this.applyActivity(next, activity, asOf, explicitId);
        }
        await this.commit(next);
        return next.plan;
    }
    /**
     * Remove an Too Many Watts recording from local coaching history only. The caller handles the FIT
     * file; previous plan decisions and external uploads are not undone.
     */
    async deleteRide(id) {
        const activity = this.data.activities.find(item => item.id === id);
        if(!activity) throw new Error('Activity not found.');
        if(activity.source !== 'too-many-watts') throw new Error('Only Too Many Watts recordings can be deleted here.');
        const next = JSON.parse(JSON.stringify(this.data));
        next.activities = next.activities.filter(item => item.id !== id);
        return this.commit(next);
    }
    /**
     * Apply a rider-confirmed outcome, such as missed or substituted, to the active plan. Check the
     * date, sport, evidence and duplicate matches before storing an adapted plan and its revision.
     */
    async resolve({workoutId = null, trigger, activityId = null, feedback = null, asOf}) {
        const next = JSON.parse(JSON.stringify(this.data));
        if(!next.plan || next.plan.status !== 'active') throw new Error('No active plan to adapt.');
        const today = date(asOf || localDay(this.clock(), next.profile.timeZone));
        const activity = activityId ? next.activities.find(a => a.id === activityId) : null;
        if(activityId && !activity) throw new Error('Activity not found.');
        if(next.safetyStatus && ['completed', 'substituted'].includes(trigger)) {
            throw new Error('Training is paused while pain or illness is reported.');
        }
        if(activity && next.plan.workouts.some(w => w.matchedActivity === activity.id)) {
            throw new Error('This activity is already matched to a workout.');
        }
        if(feedback) {
            if(!activity) throw new Error('Feedback requires an activity.');
            const updated = normalizeActivity({...activity.original, id: activity.id, streams: activity.streams,
                rpe: feedback.rpe ?? activity.rpe, feedback: {...activity.feedback, ...feedback}}, next.profile);
            Object.assign(activity, updated);
        }
        const workout = next.plan.workouts.find(w => w.id === workoutId);
        if(activity && workout && activity.sport !== (workout.sport ?? 'cycling')) {
            throw new Error('A different sport cannot substitute for this workout.');
        }
        if(activity && workout && activity.day !== workout.date) throw new Error('Substitution must occur on the scheduled local date.');
        const progressionEligible = activity && workout ? intervalsVerified(activity, workout, this.rules) : false;
        const match = activity && workout ? {workoutId, confidence: 1,
            quality: Math.min(activity.duration, workout.duration) / Math.max(activity.duration, workout.duration),
            progressionEligible,
            reason: `Rider-confirmed substitution; duration quality${FAMILIES[workout.family]?.hard
                ? progressionEligible ? ', interval execution supported by an interval summary or power stream.'
                    : ', interval fidelity unknown.' : '.'}`} : null;
        const state = this.snapshot(next, today, workout
            ? {date: workout.date, status: trigger, quality: match?.quality, family: workout.family,
                activityId: activity?.id ?? null, expectedRpe: workout.expectedRpe ?? null,
                progressionEligible: match?.progressionEligible ?? false} : null);
        next.plan = adaptPlan({plan: next.plan, profile: next.profile, state, trigger, date: today,
            timestamp: this.clock(), workoutId, activity, match});
        next.revisions.push(JSON.parse(JSON.stringify(next.plan)));
        return (await this.commit(next)).plan;
    }
    /**
     * Save effort and recovery ratings on an existing activity, then review upcoming training
     * without marking the same workout complete again.
     */
    async updateFeedback(activityId, feedback, asOf) {
        const next = JSON.parse(JSON.stringify(this.data));
        const activity = next.activities.find(a => a.id === activityId);
        if(!activity) throw new Error('Activity not found.');
        const keys = ['rpe', 'legFreshness', 'sleepQuality', 'muscleSoreness', 'stress'];
        if(!Object.keys(feedback).length || Object.entries(feedback).some(([key, value]) =>
            !keys.includes(key) || !Number.isFinite(value) || value < (key === 'rpe' ? 0 : 1) ||
            value > (key === 'rpe' ? 10 : 5))) throw new Error('Supply RPE 0-10 or feedback ratings 1-5.');
        if(Object.entries(feedback).every(([key, value]) =>
            value === (key === 'rpe' ? activity.rpe : activity.feedback[key]))) return this.data;
        const updated = normalizeActivity({...activity.original, id: activity.id, streams: activity.streams,
            rpe: feedback.rpe ?? activity.rpe, feedback: {...activity.feedback, ...feedback}}, next.profile);
        Object.assign(activity, updated);
        if(next.plan?.status === 'active') {
            const today = date(asOf || localDay(this.clock(), next.profile.timeZone));
            const state = this.snapshot(next, today);
            next.plan = adaptPlan({plan: next.plan, profile: next.profile, state, trigger: 'feedback',
                date: today, timestamp: this.clock(), activity});
            next.revisions.push(JSON.parse(JSON.stringify(next.plan)));
        }
        return this.commit(next);
    }
    /**
     * Review unresolved sessions before today as missed, preserving a revision per outcome but
     * saving once. A paused plan is left alone; a plan at its end date is marked finished.
     */
    async advance(asOf) {
        if(this.data.plan?.status !== 'active') return this.data.plan;
        if(this.data.plan.trainingPaused || this.data.safetyStatus) return this.data.plan;
        const today = date(asOf || localDay(this.clock(), this.data.profile.timeZone));
        const due = this.data.plan.workouts.filter(w => w.status === 'scheduled' && w.date < today);
        // Resolve overdue sessions in one persistent transaction, with one revision per outcome.
        const next = JSON.parse(JSON.stringify(this.data));
        for(const workout of due) {
            const current = next.plan.workouts.find(item => item.id === workout.id);
            if(current?.status !== 'scheduled') continue;
            const state = this.snapshot(next, today, {date: workout.date, status: 'missed', quality: null});
            next.plan = adaptPlan({plan: next.plan, profile: next.profile, state,
                trigger: 'missed', date: workout.date, timestamp: this.clock(), workoutId: workout.id});
            next.revisions.push(JSON.parse(JSON.stringify(next.plan)));
        }
        if(today >= next.plan.endDate) next.plan.status = 'finished';
        await this.commit(next);
        return next.plan;
    }
}

let instance;
let initializing;
/**
 * Load one shared Coach instance for the page. Concurrent callers wait for the same database
 * opening rather than creating competing instances.
 */
export async function initializeCoaching(indexedDB = window.indexedDB) {
    if(!instance && !initializing) {
        initializing = openCoachingStorage(indexedDB)
            .then(storage => { instance = new CoachingService(storage); return instance; })
            .finally(() => { initializing = null; });
    }
    if(initializing) await initializing;
    return instance;
}
/**
 * Return the loaded Coach, or throw a useful error if an action was attempted before initialization
 * finished.
 */
export function coachingService() {
    if(!instance) throw new Error('Coaching history is not loaded yet. Reload if this message persists.');
    return instance;
}
/**
 * Screens may use null to show a loading state. Actions that change data use coachingService
 * instead, so unavailable storage cannot look like an empty successful Coach.
 */
export const coachingData = () => instance?.data ?? null;
