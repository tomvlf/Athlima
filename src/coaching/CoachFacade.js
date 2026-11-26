import { createAthleteState } from './model/AthleteState.js';

export class CoachFacade {
  async buildAthleteState() {
    return createAthleteState();
  }

  async rebuildMicrocycle() {
    throw new Error('Adaptive Microcycle Engine not implemented');
  }

  async forecast() {
    throw new Error('Forecast engine not implemented');
  }
}
