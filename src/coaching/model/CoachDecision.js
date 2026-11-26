export function createCoachDecision() {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    trigger: null,
    explanation: '',
    expectedOutcome: ''
  };
}
