/** Extends the Coach dashboard with today guidance, review controls, forecasts and revision history. */

import { CoachingPanel } from './coaching-panel.js';
import { coachingService } from '../coaching/service.js';
import { reviewMicrocycle, acceptMicrocycle } from '../coaching/microcycle-service.js';
import { microcycleChangeSummary, todayRecommendation } from '../coaching/microcycle-summary.js';
import { compareMicrocycleForecasts } from '../coaching/microcycle-forecast.js';
import { microcycleRevisionHistory } from '../coaching/microcycle-history.js';
import { microcycleReviewTrigger } from '../coaching/microcycle-triggers.js';
import { formatMicrocycleTimestamp, formatMicrocycleDate, formatMicrocycleMinutes,
    formatMicrocycleNumber, microcycleMessage } from '../coaching/microcycle-format.js';

/** Escape dynamic values before inserting them into Coach HTML. */
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
/** Format a duration in seconds as UI-safe whole minutes. */
const minutes = seconds => formatMicrocycleMinutes(seconds);

/**
 * Render today's conservative Coach recommendation.
 *
 * @param {object|null} recommendation - Today recommendation data.
 * @returns {string} Safe HTML fragment.
 */
export function todayRecommendationView(recommendation) {
    if(!recommendation) return '';
    const session = recommendation.session;
    return `<section class="coach-card" data-today-recommendation><p class="eyebrow">Today</p><h3>${escape(recommendation.title)}</h3>
        ${session ? `<p><strong>${escape(session.family)}</strong> · ${minutes(session.duration)} · Effort ${escape(session.expectedRpe ?? '—')}/10</p>` : ''}
        <p>${escape(recommendation.reason)}</p>${recommendation.status === 'review' ? '<button type="button" class="secondary" data-coach="microcycle-review">Review before training</button>' : ''}</section>`;
}

/**
 * Render the transparent current-versus-candidate forecast comparison.
 *
 * @param {object} review - Reviewed microcycle proposal.
 * @returns {string} Safe HTML fragment.
 */
export function microcycleForecastView(review) {
    const forecast = compareMicrocycleForecasts(review.current, review.candidate);
    const rows = [['Sessions', 'sessions'], ['Training days', 'trainingDays'], ['Minutes', 'minutes'], ['Planned load', 'load'],
        ['Quality sessions', 'qualitySessions'], ['Recovery sessions', 'recoverySessions'], ['Longest session (min)', 'longestMinutes']];
    return `<section data-microcycle-forecast aria-labelledby="microcycle-forecast-title"><h4 id="microcycle-forecast-title">Seven-day plan comparison</h4><p><strong>${escape(forecast.headline)}</strong></p>
        <dl aria-label="Current plan and candidate forecast">${rows.map(([label, key]) =>
            `<div><dt>${escape(label)}</dt><dd><span>Current: ${escape(formatMicrocycleNumber(forecast.current[key]))}</span> → <span>Candidate: ${escape(formatMicrocycleNumber(forecast.candidate[key]))}</span></dd></div>`).join('')}</dl>
        <p class="muted">${escape(forecast.disclaimer)}</p></section>`;
}

/**
 * Render accepted microcycle revisions from the existing plan history.
 *
 * @param {object} data - Current Coach data containing immutable revisions.
 * @returns {string} Safe HTML fragment.
 */
export function microcycleHistoryView(data) {
    const history = microcycleRevisionHistory(data, 10);
    if(!history.length) return '';
    return `<details class="coach-card" data-microcycle-history><summary>Adaptive review history <span class="muted">${history.length} accepted</span></summary>
        <p class="muted">Read-only audit trail. Historical revisions cannot be restored from here.</p>
        <ol>${history.map(item => `<li><details><summary>Revision ${escape(item.revision)} · ${escape(item.trigger)} · ${escape(formatMicrocycleTimestamp(item.timestamp))}</summary>
            <p><strong>${escape(item.summary.headline)}</strong> · ${escape(item.summary.detail)}</p>
            <p>${escape(item.reasoning)}</p><p class="muted">Snapshot ${escape(item.snapshotId)} · Load change ${escape(item.loadChange ?? 'unknown')} · ${escape(item.warningCount)} warning${item.warningCount === 1 ? '' : 's'}</p>
        </details></li>`).join('')}</ol></details>`;
}

/**
 * Render either the review form or a complete candidate proposal.
 *
 * @param {object|null} review - Review proposal or null for the initial form.
 * @returns {string} Safe HTML fragment.
 */
export function microcycleReviewView(review) {
    if(!review) return `<section class="coach-card" data-microcycle-review aria-live="polite"><h3>Coach review</h3><p>Review the next seven days against your latest training history, recovery and temporary availability.</p>
        <form data-microcycle-disruptions>
            <div data-microcycle-day-rules>
                <fieldset class="microcycle-disruption-row" data-microcycle-row>
                    <legend>Temporary availability</legend>
                    <label>Date<input type="date" name="dayDate" required aria-describedby="microcycle-date-help"><small id="microcycle-date-help">Choose a date inside the review window.</small></label>
                    <label>Availability<select name="availability"><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label>
                    <label>Maximum minutes<input type="number" name="maxMinutes" min="0" max="1440" step="1" inputmode="numeric" placeholder="Optional"></label>
                    <label>Environment<select name="environment"><option value="either">Either</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option></select></label>
                    <label>Day note<input type="text" name="dayNote" maxlength="240" placeholder="e.g. late meeting"></label>
                    <button type="button" class="secondary" data-microcycle-remove-row>Remove day</button>
                </fieldset>
            </div>
            <label>General context note<input type="text" name="note" maxlength="240" placeholder="e.g. busy work week"></label>
            <button type="button" class="secondary" data-microcycle-add-row>Add another day</button>
            <p class="muted">Unavailable work is removed, never moved or made up. Nothing changes until you accept.</p>
            <button type="button" class="secondary" data-coach="microcycle-review" aria-label="Review prepares the next seven-day proposal">Review next 7 days</button>
        </form></section>`;
    const changes = review.changes || [], summary = microcycleChangeSummary(review);
    return `<section class="coach-card" data-microcycle-review aria-live="polite"><h3 tabindex="-1" data-microcycle-review-title>${review.automaticTrigger ? 'Coach review recommended' : 'Proposed week update'}</h3>
        ${review.automaticTrigger ? `<p class="coach-notice">${escape(review.automaticTrigger.reason)} The proposal will not be applied without your approval.</p>` : ''}
        <p><strong>${escape(summary.headline)}</strong> · ${escape(summary.detail)}</p><p>${escape(review.reasoning)}</p>${microcycleForecastView(review)}
        <p class="muted">${escape(review.window.startDate)} to ${escape(review.window.endDate)} · based on revision ${escape(review.source.revision)}</p>
        ${changes.length ? `<ul class="coach-upcoming">${changes.map(change => { const previous = change.previous, current = change.current, day = current?.date || previous?.date;
            const text = change.action === 'removed' ? `${escape(previous.family)} removed (${minutes(previous.duration)})` : change.action === 'added' ? `${escape(current.family)} added (${minutes(current.duration)})` : `${escape(previous.family)} ${minutes(previous.duration)} → ${escape(current.family)} ${minutes(current.duration)}`;
            return `<li><span>${escape(day)}</span><strong>${text}</strong></li>`; }).join('')}</ul>` : '<p class="muted">The review found no session changes.</p>'}
        <div class="coach-actions">${changes.length ? '<button type="button" data-coach="microcycle-accept" aria-label="Accept proposed week update">Accept update</button>' : ''}<button type="button" class="secondary" data-coach="microcycle-dismiss" aria-label="Dismiss proposed week update">Dismiss</button></div></section>`;
}

const originalPlanView = CoachingPanel.prototype.planView;
CoachingPanel.prototype.planView = function(data, plan) {
    const trigger = microcycleReviewTrigger({data});
    if(trigger && !this.microcycleReview && this.dismissedMicrocycleFingerprint !== trigger.fingerprint) {
        try { this.microcycleReview = reviewMicrocycle(coachingService(), trigger.today, undefined, {}, trigger); }
        catch(error) { console.warn('Automatic Coach review could not be prepared:', error); }
    }
    return `${todayRecommendationView(todayRecommendation({data}))}${originalPlanView.call(this, data, plan)}${microcycleReviewView(this.microcycleReview)}${microcycleHistoryView(data)}`;
};

const originalClick = CoachingPanel.prototype.click;
CoachingPanel.prototype.click = async function(event) {
    const rowAction = event.target.closest('[data-microcycle-add-row],[data-microcycle-remove-row]');
    if(rowAction) {
        const form = this.querySelector('[data-microcycle-disruptions]');
        const container = form?.querySelector('[data-microcycle-day-rules]');
        if(rowAction.hasAttribute('data-microcycle-add-row') && container) {
            const row = container.querySelector('[data-microcycle-row]');
            if(row) {
                const copy = row.cloneNode(true);
                copy.querySelector('[name=dayDate]').value = '';
                copy.querySelector('[name=maxMinutes]').value = '';
                copy.querySelector('[name=dayNote]').value = '';
                copy.querySelector('[name=availability]').value = 'available';
                copy.querySelector('[name=environment]').value = 'either';
                container.appendChild(copy);
            }
        }
        if(rowAction.hasAttribute('data-microcycle-remove-row')) {
            const row = rowAction.closest('[data-microcycle-row]');
            if(container?.querySelectorAll('[data-microcycle-row]').length > 1) row?.remove();
        }
        return;
    }
    const action = event.target.closest('[data-coach]')?.dataset.coach;
    if(!['microcycle-review', 'microcycle-accept', 'microcycle-dismiss'].includes(action)) return originalClick.call(this, event);
    try {
        const service = coachingService();
        if(action === 'microcycle-review') {
            const form = this.querySelector('[data-microcycle-disruptions]');
            const unavailableDates = [], maxMinutesByDate = {}, environmentByDate = {}, notesByDate = {};
            const seen = new Set();
            for(const row of form?.querySelectorAll('[data-microcycle-row]') || []) {
                const day = row.querySelector('[name=dayDate]').value.trim();
                if(!day) continue;
                if(seen.has(day)) throw new Error(`Duplicate temporary availability date: ${day}.`);
                seen.add(day);
                if(row.querySelector('[name=availability]').value === 'unavailable') unavailableDates.push(day);
                const max = row.querySelector('[name=maxMinutes]').value;
                if(max !== '') maxMinutesByDate[day] = Number(max);
                const environment = row.querySelector('[name=environment]').value;
                if(environment !== 'either') environmentByDate[day] = environment;
                const note = row.querySelector('[name=dayNote]').value.trim();
                if(note) notesByDate[day] = note.slice(0, 240);
            }
            this.microcycleReview = reviewMicrocycle(service, null, undefined, {
                unavailableDates, maxMinutesByDate, environmentByDate, notesByDate,
                note: form?.elements.note.value || '',
            });
            this.notice = 'Coach review ready. Inspect the proposal before accepting.';
            this.render();
            this.querySelector('[data-microcycle-review-title]')?.focus();
            return;
        }
        if(action === 'microcycle-accept') { if(!this.microcycleReview) throw new Error('Review the current plan before accepting an update.'); await acceptMicrocycle(service, this.microcycleReview); this.microcycleReview = null; this.dismissedMicrocycleFingerprint = null; this.notice = 'The reviewed seven-day update was accepted and saved.'; }
        if(action === 'microcycle-dismiss') { this.dismissedMicrocycleFingerprint = this.microcycleReview?.automaticTrigger?.fingerprint ?? null; this.microcycleReview = null; this.notice = 'Coach proposal dismissed. Your plan was not changed.'; }
        this.changed();
        if(action === 'microcycle-dismiss') {
            this.querySelector('[data-coach=microcycle-review]')?.focus();
        } else if(action === 'microcycle-accept') {
            this.querySelector('[role=status]')?.setAttribute('tabindex', '-1');
            this.querySelector('[role=status]')?.focus();
        }
    } catch(error) {
        console.error('Microcycle review action failed:', error);
        this.error = error.message || error.name || 'Coach review failed.';
        this.microcycleReview = null;
        this.render({keepInput: true});
        const invalidDate = this.querySelector('[name=dayDate]');
        if(invalidDate) {
            invalidDate.setAttribute('aria-invalid', 'true');
            invalidDate.focus();
        }
    }
};
