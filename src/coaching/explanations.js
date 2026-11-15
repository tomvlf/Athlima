/**
 * Writes the explanatory sentences shown with Coach decisions. These functions describe decisions
 * already made; they do not choose workouts, save data or ask a language model. Keeping wording
 * together helps the screens explain the same rules consistently.
 */

/**
 * Describe why this phase exists and which capabilities it emphasizes, using riding/running wording
 * for the coached sport.
 */
export function explainPhase(type, focus, sport = 'cycling') {
    const reasons = {
        assessment: 'Establish a conservative baseline without requiring a maximal test.',
        preparation: `Reintroduce consistent, manageable ${sport === 'running' ? 'running' : 'riding'}.`,
        base: 'Develop repeatable easy volume before demanding work.',
        build: 'Gradually develop the highest-priority goal capabilities.',
        specific: 'Practice demands relevant to the dated goal.',
        peak: 'Maintain specificity without adding volume.',
        taper: 'Reduce volume but keep frequency and a short touch of intensity before the goal; do not make up missed work.',
        event: 'Goal day; event demands are not counted as prescribed training.',
        recovery: 'Planned reduction in training demand to support recovery.',
    };
    return `${reasons[type]} Focus: ${focus.join(', ')}.`;
}
/**
 * Describe a week's time and load ceilings, historical reference and uncertainty. A ceiling is not
 * a physiological guarantee.
 */
export function explainWeek(week, state) {
    const points = state.sport === 'running' ? 'pace-load (rTSS-like)' : 'power-load';
    return `${week.phaseType}: ${week.targetMinutes} minutes, at most ${week.targetLoad} modelled ${points} points. ` +
        `Based on ${Math.round(state.baselineWeeklyMinutes)} historical weekly minutes, availability and a ` +
        `${Math.round(week.rampLimit * 100)}% maximum increase over the prior four-week scheduled envelope ` +
        '(planned recovery weeks may return to that envelope). ' +
        `Confidence: ${state.confidence}. ` +
        'These are conservative planning heuristics, not physiological guarantees.';
}
const RUN_GUIDANCE = {
    endurance: 'Run at a conversational effort.',
    recovery: 'Keep it very easy; walking breaks are fine.',
    threshold: 'Run the repetitions at a comfortably hard, controlled effort (about one-hour race pace).',
    aerobic: 'Run the repetitions at about 3-5 km race effort with equal-time easy jogs.',
    sprint: 'Run the short repetitions fast but relaxed, with full easy-jog recoveries.',
    durability: 'Keep the long run easy; it builds endurance, not speed.',
};
/**
 * Explain a session's purpose and progression level, adding running effort, walk-break and stride
 * instructions when applicable.
 */
export function explainWorkout(family, phaseType, level, sport = 'cycling', runFormat = null) {
    const run = sport === 'running' ? [
        RUN_GUIDANCE[family],
        runFormat?.runWalk ? `Alternate ${runFormat.runWalk[0]} s running with ${runFormat.runWalk[1]} s brisk walking.` : '',
        runFormat?.strides && family === 'endurance' ? `Finish with ${runFormat.strides} relaxed 20 s strides.` : '',
    ].filter(Boolean).join(' ') + ' ' : '';
    return `${family} supports ${phaseType} objectives; progression level ${level}. ${run}` +
        'Stop or reduce the session if it feels inappropriate; missed work is never stacked into later days.';
}
/**
 * Summarize the review trigger and any reduction in upcoming training, including the rule against
 * adding catch-up sessions.
 */
export function explainAdaptation(trigger, reduction) {
    return `${trigger}: future training ${reduction < 1 ? `reduced by ${Math.round((1 - reduction) * 100)}%` : 'reviewed without automatic escalation'}. ` +
        'Past workouts remain unchanged. No catch-up sessions are added; availability, spacing and load limits are revalidated.';
}
