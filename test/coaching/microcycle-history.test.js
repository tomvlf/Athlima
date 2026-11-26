/** Tests Phase 9 compact history over existing immutable plan revisions. */
import { microcycleRevisionHistory } from '../../src/coaching/microcycle-history.js';

const revision = (number, options = {}) => ({id: 'plan', revision: number, sourceSnapshot: `state-${number}`,
    adaptations: number === 1 ? [] : [{previousRevision: number - 1, newRevision: number,
        trigger: options.trigger || 'feedback', timestamp: `2026-01-0${number}T10:00:00Z`,
        reasoning: options.reasoning || 'Reviewed current evidence.', loadChange: options.loadChange ?? -10,
        observations: {snapshotId: `state-${number}`, ...(options.review ? {microcycleReview: options.review} : {})},
        changes: options.changes || [{action: 'modified', previous: {duration: 3600}, current: {duration: 2700}}],
        validationWarnings: options.warnings || []}]});

test('returns newest accepted review revisions with compact summaries', () => {
    const data = {revisions: [revision(1), revision(2), revision(3, {review: {kind: 'weekly', reason: 'Seven days passed.'}, warnings: ['Check load.']})]};
    const before = JSON.stringify(data);
    const history = microcycleRevisionHistory(data);
    expect(history.map(item => item.revision)).toEqual([3, 2]);
    expect(history[0]).toMatchObject({trigger: 'weekly', triggerReason: 'Seven days passed.',
        changeCount: 1, loadChange: -10, warningCount: 1});
    expect(history[0].summary).toMatchObject({deltaMinutes: -15, headline: '1 adjusted'});
    expect(JSON.stringify(data)).toBe(before);
});

test('excludes unrelated revisions and validates the limit', () => {
    const unrelated = revision(2, {trigger: 'completed'});
    expect(microcycleRevisionHistory({revisions: [revision(1), unrelated]})).toEqual([]);
    expect(() => microcycleRevisionHistory({revisions: []}, 0)).toThrow(/between 1 and 50/);
});

test('applies a newest-first limit without exposing mutable source objects', () => {
    const history = microcycleRevisionHistory({revisions: [revision(2), revision(3), revision(4)]}, 2);
    expect(history.map(item => item.revision)).toEqual([4, 3]);
    history[0].reasoning = 'changed';
    expect(history[1].reasoning).not.toBe('changed');
});
