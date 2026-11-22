/*
 * plan-view.js: renders the Training plan page.
 *
 * The plan is shown as answers to three rider questions: where am I in the plan, what do I ride
 * this week, and what comes next. Technical planner output (rationales, revisions) stays available
 * in collapsed sections instead of leading the page. Plan text is interpolated as text.
 */

import { FAMILIES } from '../coaching/workouts.js';
import { RUN_TITLES } from '../coaching/running.js';
import { mobileDetails } from './format.js';
import { html } from '../html.js';

const PHASES = {
    assessment: ['Baseline', 'Easy sessions that show the Coach where your fitness is today.'],
    preparation: ['Preparation', 'Easing into regular, structured training.'],
    base: ['Base', 'Building endurance with mostly easy, steady training.'],
    build: ['Build', 'Adding harder sessions aimed at your goal.'],
    specific: ['Event-specific', 'Training that looks like the demands of your goal.'],
    peak: ['Peak', 'Keeping sharpness without adding more volume.'],
    taper: ['Taper', 'Less training so you arrive fresh.'],
    recovery: ['Recovery week', 'A lighter week so your body can absorb the training.'],
    event: ['Goal', 'Your goal day.'],
};
const FAMILY_LABELS = {
    endurance: 'Endurance ride', recovery: 'Recovery ride', durability: 'Long ride',
    threshold: 'Threshold intervals', aerobic: 'VO2 max intervals', sprint: 'Sprint session',
};
const STATUS = {
    scheduled: ['Planned', 'planned'], completed: ['Done', 'done'], substituted: ['Done (other ride)', 'done'],
    missed: ['Missed', 'missed'], failed: ['Not completed', 'missed'],
};
const GOAL_TYPES = {
    general_fitness: 'General fitness', ftp_improvement: 'Raise FTP', gran_fondo: 'Gran fondo', climbing: 'Climbing',
    time_trial: 'Time trial', road_race: 'Road race', criterium: 'Criterium', sprint: 'Sprinting',
    long_distance_completion: 'Long-distance ride',
    general_running: 'General running fitness', first_5k: 'First 5 km', run_5k: '5 km race', run_10k: '10 km race',
    half_marathon: 'Half marathon', marathon: 'Marathon', ultra_trail: 'Ultra / trail',
};
// Run plans reuse the cycling layout; only the words change.
const WORDS = {
    cycling: {session: 'ride', sessions: 'rides', act: 'Ride', prepare: 'Prepare to ride', other: 'other ride', families: FAMILY_LABELS},
    running: {session: 'run', sessions: 'runs', act: 'View', prepare: 'View run', other: 'other run', families: RUN_TITLES},
};
/**
 * Select cycling or running labels, including older plans that record the sport only on their
 * workouts.
 */
const wordsFor = plan => WORDS[plan?.sport === 'running' || plan?.workouts?.[0]?.sport === 'running' ? 'running' : 'cycling'];

const phaseName = type => PHASES[type]?.[0] || String(type ?? '').replaceAll('_', ' ');
/**
 * Format a calendar-only date in UTC so the displayed day does not shift with the browser's time
 * zone.
 */
const dateLabel = (day, options = {weekday: 'short', day: 'numeric', month: 'short'}) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {...options, timeZone: 'UTC'});
const rangeLabel = (start, end) => `${dateLabel(start, {day: 'numeric', month: 'short'})} – ${dateLabel(end, {day: 'numeric', month: 'short'})}`;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const isDone = workout => ['completed', 'substituted'].includes(workout.status);
const hours = seconds => {
    const total = Math.round(seconds / 60);
    const h = Math.floor(total / 60), m = total % 60;
    return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};
const sessionName = (workout, words = WORDS.cycling) => workout.libraryName || words.families[workout.family] || workout.title;
const sessionKind = (workout, words = WORDS.cycling) => workout.libraryName && words.families[workout.family]
    ? `${words.families[workout.family]} · ` : '';
const badge = (text, kind = '') => html`<span class="plan-chip ${kind}">${text}</span>`;

/**
 * Describe a session's day, effort and outcome. An unresolved past date is shown as not yet logged
 * rather than falsely marked completed.
 */
function sessionRow(workout, day, words) {
    const [status, kind] = workout.status === 'substituted' ? [`Done (${words.other})`, 'done'] : STATUS[workout.status] || [workout.status, ''];
    const hard = FAMILIES[workout.family]?.hard;
    const isToday = workout.date === day;
    const overdue = workout.status === 'scheduled' && workout.date < day;
    return html`<li class="plan-session ${isToday ? 'today' : ''} ${isDone(workout) ? 'is-done' : ''}">
        <div class="plan-session-day"><strong>${isToday ? 'Today' : dateLabel(workout.date, {weekday: 'short'})}</strong>
            <span>${dateLabel(workout.date, {day: 'numeric', month: 'short'})}</span></div>
        <div class="plan-session-body"><strong>${sessionName(workout, words)}</strong>
            <span>${sessionKind(workout, words)}${hours(workout.duration)} · ${hard ? 'Hard effort' : 'Easy effort'}${workout.expectedRpe ? ` · RPE ${workout.expectedRpe}/10` : ''}</span>
            ${workout.libraryAdjustments?.length ? html`<span class="plan-session-note">Adjusted for you: ${workout.libraryAdjustments.join(', ')}</span>` : ''}</div>
        <div class="plan-session-status">${overdue ? badge('Not yet logged', 'missed') : workout.status !== 'scheduled' ? badge(status, kind) : ''}${hard ? badge('Key session', 'hard') : ''}</div>
        <a class="button ${isToday && workout.status === 'scheduled' ? '' : 'secondary'}" href="#/workout/${encodeURIComponent(workout.id)}"
            aria-label="${isToday ? words.act : 'View'} ${sessionName(workout, words)} on ${dateLabel(workout.date)}">${isToday && workout.status === 'scheduled' ? words.act : 'View'}</a>
    </li>`;
}

/**
 * Group a week's sessions and totals in an expandable section, highlighting the current week and
 * counting completed/substituted sessions.
 */
function weekBlock(week, index, workouts, day, open, words) {
    const planned = workouts.reduce((total, w) => total + w.duration, 0);
    const done = workouts.filter(isDone).length;
    const current = week.startDate <= day && week.endDate >= day;
    const past = week.endDate < day;
    const summary = workouts.length
        ? `${workouts.length} ${workouts.length === 1 ? words.session : words.sessions} · ${hours(planned)}${past || current ? ` · ${done}/${workouts.length} done` : ''}`
        : 'Rest week';
    return html`<details class="plan-week ${current ? 'current' : ''}" ${open ? 'open' : ''}>
        <summary><span class="plan-week-title"><strong>${current ? 'This week' : `Week ${index + 1}`}</strong>
            <span>${rangeLabel(week.startDate, week.endDate)}</span></span>
            ${badge(phaseName(week.phaseType), `phase-${workoutPhase(week.phaseType)}`)}
            <span class="plan-week-summary">${summary}</span></summary>
        ${workouts.length ? html`<ul class="plan-sessions">${workouts.map(w => sessionRow(w, day, words))}</ul>`
            : html`<p class="muted">No ${words.sessions} planned this week.</p>`}
        ${PHASES[week.phaseType] ? html`<p class="muted plan-week-note">${PHASES[week.phaseType][1]}</p>` : ''}
    </details>`;
}

/** Keep an unknown provider/planner phase type inside a valid class token. */
const workoutPhase = type => String(type ?? '').replace(/[^a-z0-9_-]/gi, '');

/**
 * Draw phase lengths proportionally across the plan, position today's marker and include a text
 * legend so colours are not the only explanation.
 */
function timeline(plan, day) {
    const total = Math.max(1, daysBetween(plan.startDate, plan.endDate) + 1);
    const position = Math.min(100, Math.max(0, daysBetween(plan.startDate, day) / total * 100));
    const types = [...new Set(plan.phases.map(p => p.type))];
    return html`<div class="plan-timeline" role="img" aria-label="Plan phases from ${dateLabel(plan.startDate)} to ${dateLabel(plan.endDate)}">
            ${plan.phases.map(phase => html`<span class="phase-${workoutPhase(phase.type)} ${phase.startDate <= day && phase.endDate >= day ? 'current' : ''}"
                style="flex-grow:${daysBetween(phase.startDate, phase.endDate) + 1}" title="${phaseName(phase.type)}: ${rangeLabel(phase.startDate, phase.endDate)}"></span>`)}
            <i class="plan-now" style="left:${position.toFixed(1)}%"></i>
        </div>
        <div class="plan-timeline-dates"><span>${dateLabel(plan.startDate)}</span><span>${dateLabel(plan.endDate)}</span></div>
        <ul class="plan-legend">${types.map(type => html`<li><i class="phase-${workoutPhase(type)}"></i><strong>${phaseName(type)}</strong>
            <span>${PHASES[type]?.[1] || ''}</span></li>`)}</ul>`;
}

/**
 * Renders the Training plan page for the current Coach data.
 *
 * @param {object|null} data - Coaching data with `plan` and `goal`.
 * @param {string} day - The rider's local ISO day.
 * @returns {string} HTML markup for the page content.
 */
export function renderPlan(data, day) {
    const plan = data?.plan;
    if(!plan) {
        return html`<section class="panel plan-empty"><h2>No training plan yet</h2>
            <p>The Coach builds a plan around your goal, the days you can ride and your recent training.
            It takes about two minutes to set up.</p><a class="button" href="#/coach">Create your training plan</a></section>`;
    }
    const workouts = [...plan.workouts].sort((a, b) => a.date.localeCompare(b.date));
    const weeks = plan.weeks?.length ? plan.weeks : [{id: 'all', startDate: plan.startDate, endDate: plan.endDate}];
    /**
     * Find sessions for a week by ID, retaining older records whose missing/stale week IDs can
     * still be placed by their date.
     */
    const inWeek = week => workouts.filter(w => week.id === 'all' || w.weekId === week.id
        || (!weeks.some(x => x.id === w.weekId) && w.date >= week.startDate && w.date <= week.endDate));
    const currentIndex = weeks.findIndex(w => w.startDate <= day && w.endDate >= day);
    const phase = plan.phases.find(p => p.startDate <= day && p.endDate >= day);
    const due = workouts.filter(w => w.date <= day);
    const done = due.filter(isDone).length;
    const next = workouts.find(w => w.status === 'scheduled' && w.date >= day);
    const toGo = daysBetween(day, plan.endDate);
    const elapsed = Math.min(100, Math.max(0, daysBetween(plan.startDate, day) / Math.max(1, daysBetween(plan.startDate, plan.endDate)) * 100));
    const archived = plan.status === 'archived';
    const goal = data.goal || {};
    const stat = (value, label) => html`<div><strong>${value}</strong><span>${label}</span></div>`;
    const words = wordsFor(plan);

    const past = currentIndex < 0 ? weeks.filter(w => w.endDate < day) : weeks.slice(0, currentIndex);
    const upcoming = currentIndex < 0 ? weeks.filter(w => w.startDate > day) : weeks.slice(currentIndex + 1);
    const block = (week, open = false) => weekBlock(week, weeks.indexOf(week), inWeek(week), day, open, words);

    return html`${archived ? html`<div class="coach-notice">This plan has been archived. <a href="#/coach">Create a new plan in Coach</a>.</div>` : ''}
        <section class="panel plan-overview">
            <div class="plan-overview-head">
                <div><p class="eyebrow">${GOAL_TYPES[goal.type] || 'Your goal'}${goal.priority ? ` · Priority ${goal.priority}` : ''}</p>
                    <h2>${goal.name || 'Your plan'}</h2>
                    <p class="muted">${dateLabel(plan.startDate, {day: 'numeric', month: 'long', year: 'numeric'})} → ${dateLabel(plan.endDate, {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'})}</p></div>
                <a class="button secondary" href="#/coach">Adjust in Coach</a>
            </div>
            <div class="coach-stats plan-stats">
                ${stat(currentIndex >= 0 ? html`${currentIndex + 1}<small>/${weeks.length}</small>` : '--', 'Week')}
                ${stat(Math.max(0, toGo), toGo === 1 ? 'Day to go' : 'Days to go')}
                ${stat(due.length ? html`${done}<small>/${due.length}</small>` : '--', 'Sessions done so far')}
            </div>
            <div class="coach-progress" role="progressbar" aria-label="Time through plan" aria-valuemin="0" aria-valuemax="100"
                aria-valuenow="${Math.round(elapsed)}"><i style="width:${elapsed.toFixed(1)}%"></i></div>
            ${phase ? html`<p class="plan-phase-now">Now: ${badge(phaseName(phase.type), `phase-${workoutPhase(phase.type)}`)} ${PHASES[phase.type]?.[1] || ''}
                <span class="muted">Until ${dateLabel(phase.endDate)}.</span></p>` : ''}
            ${next && !archived ? html`<div class="plan-next"><div><span class="eyebrow">${next.date === day ? 'Today' : 'Next session'}</span>
                <strong>${sessionName(next, words)} · ${hours(next.duration)}</strong>
                <span class="muted">${dateLabel(next.date, {weekday: 'long', day: 'numeric', month: 'long'})}</span></div>
                <a class="button" href="#/workout/${encodeURIComponent(next.id)}">${next.date === day ? words.prepare : 'View session'}</a></div>` : ''}
        </section>
        <section class="panel">${mobileDetails('plan-timeline', 'Plan at a glance', html`<h2 class="desktop-section-title">Plan at a glance</h2>${timeline(plan, day)}`)}</section>
        ${workouts.length ? html`<section class="panel plan-weeks"><h2>Week by week</h2>
            ${currentIndex >= 0 ? block(weeks[currentIndex], true) : ''}
            ${upcoming.length ? html`<h3>Coming up</h3>${upcoming.slice(0, 4).map((w, i) => block(w, currentIndex < 0 && i === 0))}` : ''}
            ${upcoming.length > 4 ? html`<details class="plan-past"><summary>Later weeks (${upcoming.length - 4})</summary>${upcoming.slice(4).map(w => block(w))}</details>` : ''}
            ${past.length ? html`<details class="plan-past"><summary>Earlier weeks (${past.length})</summary>${past.map(w => block(w))}</details>` : ''}
        </section>` : html`<section class="panel"><h2>No sessions scheduled</h2>
            <p>No ${words.sessions} fit within your current availability and training-load limits. Check your available days and hours in Coach,
            then create a new plan.</p><a class="button secondary" href="#/coach">Review Coach</a></section>`}
        <section class="panel plan-more">
            <details><summary>Recent changes to your plan (${plan.adaptations.length})</summary>
                ${plan.adaptations.length ? html`<ul class="plan-changes">${plan.adaptations.slice(-10).reverse().map(a => html`<li>
                    <span class="muted">${new Date(a.timestamp).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'})}</span>
                    ${a.reasoning}</li>`)}</ul>`
                    : html`<p class="muted">The Coach adjusts your plan after recorded ${words.sessions}, feedback or missed sessions. Changes will be listed here.</p>`}
            </details>
            <details><summary>How this plan was built</summary><p>${plan.rationale}</p>
                ${phase?.rationale ? html`<p><strong>Current phase:</strong> ${phase.rationale}</p>` : ''}
                ${currentIndex >= 0 && weeks[currentIndex].rationale ? html`<p><strong>This week:</strong> ${weeks[currentIndex].rationale}</p>` : ''}
            </details>
        </section>`;
}
