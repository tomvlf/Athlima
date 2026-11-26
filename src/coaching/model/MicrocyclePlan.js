export function createMicrocyclePlan() {
  return {
    id: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    validFrom: null,
    validTo: null,
    sessions: [],
    forecast: null,
    decisions: []
  };
}
