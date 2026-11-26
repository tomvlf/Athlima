export function createPlannedSession() {
  return {
    id: crypto.randomUUID(),
    date: null,
    role: 'maintenance',
    primaryStimulus: null,
    secondaryStimulus: null,
    targetDurationMinutes: 0,
    targetLoad: 0,
    importance: 0,
    workoutId: null
  };
}
