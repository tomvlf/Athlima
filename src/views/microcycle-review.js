/** Extends the Coach dashboard with today guidance, disruption input and explicit review controls. */

import { CoachingPanel } from './coaching-panel.js';
import { coachingService } from '../coaching/service.js';
import { reviewMicrocycle, acceptMicrocycle } from '../coaching/microcycle-service.js';
import { microcycleChangeSummary, todayRecommendation } from '../coaching/microcycle-summary.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
const minutes = seconds => `${Math.round((seconds || 0) / 60)} min`;

export function todayRecommendationView(recommendation) {
    if(!recommendation) return '';
    const session = recommendation.session;
    return `<section class="coach-card" data-today-recommendation><p class="eyebrow">Today</p>
        <h3>${escape(recommendation.title)}</h3>
        ${session ? `<p><strong>${escape(session.family)}</strong> · ${minutes(session.duration)} · Effort ${escape(session.expectedRpe ?? '—')}/10</p>` : ''}
        <p>${escape(recommendation.reason)}</p>
        ${recommendation.status === 'review' ? '<button type="button" class="secondary" data-coach="microcycle-review">Review before training</button>' : ''}
    </section>`;
}

export function microcycleReviewView(review) {
    if(!review) return `<section class="coach-card" data-microcycle-review>
        <h3>Coach review</h3>
        <p>Review the next seven days against your latest training history, recovery and temporary availability.</p>
        <form data-microcycle-disruptions>
            <label>Unavailable dates <input name="unavailableDates" placeholder="YYYY-MM-DD, YYYY-MM-DD">
                <small>Optional, comma-separated dates in the next seven days.</small></label>
            <label>Shorter session <input type="date" name="limitDate"> <input type="number" name="maxMinutes" min="0" max="1440" step="1" placeholder="minutes"></label>
            <label>Context note <input name="note" maxlength="240" placeholder="e.g. travel or late meeting"></label>
            <p class="muted">Unavailable work is removed, never moved or made up. Nothing changes until you accept.</p>
            <button type="button" class="secondary" data-coach="microcycle-review">Review next 7 days</button>
        </form>
    </section>`;
    const changes = review.changes || [], summary = microcycleChangeSummary(review);
    return `<section class="coach-card" data-microcycle-review><h3>Proposed week update</h3>
        <p><strong>${escape(summary.headline)}</strong> · ${escape(summary.detail)}</p>
        <p>${escape(review.reasoning)}</p>
        ${review.disruptions?.note ? `<p class="muted"><strong>Context:</strong> ${escape(review.disruptions.note)}</p>` : ''}
        <p class="muted">${escape(review.window.startDate)} to ${escape(review.window.endDate)} · based on revision ${escape(review.source.revision)}</p>
        ${changes.length ? `<ul class="coach-upcoming">${changes.map(change => {
            const previous = change.previous, current = change.current, day = current?.date || previous?.date;
            const text = change.action === 'removed' ? `${escape(previous.family)} removed (${minutes(previous.duration)})`
                : change.action === 'added' ? `${escape(current.family)} added (${minutes(current.duration)})`
                    : `${escape(previous.family)} ${minutes(previous.duration)} → ${escape(current.family)} ${minutes(current.duration)}`;
            return `<li><span>${escape(day)}</span><strong>${text}</strong></li>`;
        }).join('')}</ul>` : '<p class="muted">The review found no session changes.</p>'}
        ${review.validationWarnings?.length ? `<details><summary>Validation warnings</summary><ul>${review.validationWarnings.map(warning => `<li>${escape(warning)}</li>`).join('')}</ul></details>` : ''}
        <div class="coach-actions">${changes.length ? '<button type="button" data-coach="microcycle-accept">Accept update</button>' : ''}
            <button type="button" class="secondary" data-coach="microcycle-dismiss">Dismiss</button></div>
    </section>`;
}

const originalPlanView = CoachingPanel.prototype.planView;
CoachingPanel.prototype.planView = function(data, plan) {
    return `${todayRecommendationView(todayRecommendation({data}))}${originalPlanView.call(this, data, plan)}${microcycleReviewView(this.microcycleReview)}`;
};

const originalClick = CoachingPanel.prototype.click;
CoachingPanel.prototype.click = async function(event) {
    const action = event.target.closest('[data-coach]')?.dataset.coach;
    if(!['microcycle-review', 'microcycle-accept', 'microcycle-dismiss'].includes(action)) return originalClick.call(this, event);
    try {
        const service = coachingService();
        if(action === 'microcycle-review') {
            const form = this.querySelector('[data-microcycle-disruptions]');
            const unavailableDates = String(form?.elements.unavailableDates.value || '').split(',').map(value => value.trim()).filter(Boolean);
            const limitDate = form?.elements.limitDate.value, max = form?.elements.maxMinutes.value;
            const disruptions = {unavailableDates, note: form?.elements.note.value || '',
                maxMinutesByDate: limitDate && max !== '' ? {[limitDate]: Number(max)} : {}};
            this.microcycleReview = reviewMicrocycle(service, null, undefined, disruptions);
            this.notice = this.microcycleReview.changes.length ? 'Coach review ready. Inspect the proposed changes before accepting.' : 'Coach review complete. No session changes are needed.';
        }
        if(action === 'microcycle-accept') {
            if(!this.microcycleReview) throw new Error('Review the current plan before accepting an update.');
            await acceptMicrocycle(service, this.microcycleReview);
            this.microcycleReview = null;
            this.notice = 'The reviewed seven-day update was accepted and saved.';
        }
        if(action === 'microcycle-dismiss') {
            this.microcycleReview = null;
            this.notice = 'Coach proposal dismissed. Your plan was not changed.';
        }
        this.changed();
    } catch(error) {
        console.error('Microcycle review action failed:', error);
        this.error = error.message || error.name || 'Coach review failed.';
        this.microcycleReview = null;
        this.render({keepInput: true});
    }
};
