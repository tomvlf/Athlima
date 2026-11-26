/**
 * Athlete state snapshot used by the future Adaptive Microcycle Engine.
 */
export function createAthleteState() {
  return {
    generatedAt: new Date().toISOString(),
    fitness: 0,
    fatigue: 0,
    form: 0,
    readiness: null,
    compliance: null,
    phase: 'base',
    daysToGoal: null,
    goalId: null
  };
}
