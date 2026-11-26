/**
 * Compares current and candidate microcycle projections using only scheduled duration, load and role
 * data already present in the Coach. It is a transparent plan comparison, not a physiological
 * prediction, performance promise or new planning model.
 */

const round = value => Math.round(value * 10) / 10;
const loadOf = session => Number.isFinite(session.scheduledLoad) ? session.scheduledLoad : 0;

/** Aggregate one bounded projection into stable review metrics. */
export function microcycleForecast(projection) {
    if(!projection?.sessions || !Array.isArray(projection.sessions)) {
        throw new Error('A projected microcycle with sessions is required.');
    }
    const scheduled = projection.sessions.filter(session => session.status === 'scheduled');
    const roles = {};
    for(const session of scheduled) roles[session.role] = (roles[session.role] || 0) + 1;
    const minutes = round(scheduled.reduce((total, session) => total + session.duration / 60, 0));
    const load = round(scheduled.reduce((total, session) => total + loadOf(session), 0));
    const trainingDays = new Set(scheduled.map(session => session.date)).size;
    const qualitySessions = scheduled.filter(session => session.role === 'quality').length;
    const recoverySessions = scheduled.filter(session => session.role === 'recovery').length;
    const longestMinutes = round(Math.max(0, ...scheduled.map(session => session.duration / 60)));
    return {sessions: scheduled.length, trainingDays, minutes, load, qualitySessions,
        recoverySessions, longestMinutes, roles};
}

/** Compare two projections and label only directly observable scheduling changes. */
export function compareMicrocycleForecasts(current, candidate) {
    const before = microcycleForecast(current), after = microcycleForecast(candidate);
    const delta = {
        sessions: after.sessions - before.sessions,
        trainingDays: after.trainingDays - before.trainingDays,
        minutes: round(after.minutes - before.minutes),
        load: round(after.load - before.load),
        qualitySessions: after.qualitySessions - before.qualitySessions,
        recoverySessions: after.recoverySessions - before.recoverySessions,
        longestMinutes: round(after.longestMinutes - before.longestMinutes),
    };
    const observations = [];
    if(delta.minutes) observations.push(`${Math.abs(delta.minutes)} planned minute${Math.abs(delta.minutes) === 1 ? '' : 's'} ${delta.minutes < 0 ? 'less' : 'more'}`);
    if(delta.load) observations.push(`${Math.abs(delta.load)} planned load point${Math.abs(delta.load) === 1 ? '' : 's'} ${delta.load < 0 ? 'less' : 'more'}`);
    if(delta.qualitySessions) observations.push(`${Math.abs(delta.qualitySessions)} quality session${Math.abs(delta.qualitySessions) === 1 ? '' : 's'} ${delta.qualitySessions < 0 ? 'fewer' : 'more'}`);
    if(delta.trainingDays) observations.push(`${Math.abs(delta.trainingDays)} training day${Math.abs(delta.trainingDays) === 1 ? '' : 's'} ${delta.trainingDays < 0 ? 'fewer' : 'more'}`);
    return {current: before, candidate: after, delta,
        headline: observations.length ? observations.join(', ') : 'No aggregate forecast change',
        disclaimer: 'Plan comparison only. This does not predict fitness, health, fatigue or performance.'};
}
