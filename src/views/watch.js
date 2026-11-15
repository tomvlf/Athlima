/*
 * Manages the ride timer's Start, Pause, Lap, Back, Stop, and Save buttons.
 * Button handlers send ui: requests; db: status messages decide which buttons
 * are visible. The timer and activity-saving work happens elsewhere.
 *
 * connectedCallback wires the buttons when <watch-control> enters the page.
 * disconnectedCallback cancels its listeners, so a removed control stops reacting.
 */

import { xf } from '../functions.js';

// The render methods select the button set for each ride state, not the clock text.
class Watch extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        const self = this;
        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };

        this.dom = {
            start:   document.querySelector('#watch-start'),
            pause:   document.querySelector('#watch-pause'),
            back:    document.querySelector('#watch-back'),
            lap:     document.querySelector('#watch-lap'),
            stop:    document.querySelector('#watch-stop'),
            save:    document.querySelector('#activity-save'),
            // workout: document.querySelector('#start-workout'),
        };

        this.dom.start.addEventListener('pointerup', this.onStart, this.signal);
        this.dom.pause.addEventListener('pointerup', this.onPause, this.signal);
        this.dom.back.addEventListener('pointerup', this.onBack, this.signal);
        this.dom.lap.addEventListener('pointerup', this.onLap, this.signal);
        this.dom.stop.addEventListener('pointerup', this.onStop, this.signal);
        // this.dom.workout.addEventListener('pointerup', this.onWorkoutStart);
        this.dom.save.addEventListener(`pointerup`, this.onSave, this.signal);

        this.renderInit(this.dom);

        xf.sub(`db:watchStatus`, this.onWatchStatus.bind(this), this.signal);
        xf.sub(`db:workoutStatus`, this.onWorkoutStatus.bind(this), this.signal);
    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    // Starting a ride also starts or resumes the selected structured workout.
    onStart(e) {
        xf.dispatch('ui:watchStart');
        xf.dispatch('ui:workoutStart');
    }
    onPause(e) { xf.dispatch('ui:watchPause'); }
    onBack(e)  { xf.dispatch('ui:watchBack'); }
    onLap(e)   { xf.dispatch('ui:watchLap'); }
    onStop(e)  { xf.dispatch('ui:watchStop'); }
    onSave(e)  { xf.dispatch('ui:activity:save'); }
    onWorkoutStart(e) { xf.dispatch('ui:workoutStart'); }
    onWatchStatus(status) {
        if(status === 'started') { this.renderStarted(this.dom); }
        if(status === 'paused')  { this.renderPaused(this.dom);  }
        if(status === 'stopped') { this.renderStopped(this.dom); }
    }
    onWorkoutStatus(status) {
        if(status === 'started') { this.renderWorkoutStarted(this.dom); }
        if(status === 'done')    {  }
    }
    renderInit(dom) {
        dom.pause.style.display = 'none';
        dom.stop.style.display  = 'none';
        dom.save.style.display  = 'none';
        dom.lap.style.display   = 'none';
        dom.back.style.display  = 'none';
    };
    renderStarted(dom) {
        dom.start.style.display  = 'none';
        dom.save.style.display   = 'none';
        dom.pause.style.display  = 'inline-block';
        dom.lap.style.display    = 'inline-block';
        dom.back.style.display   = 'inline-block';
        dom.stop.style.display   = 'none';
        // dom.stop.style.display  = 'inline-block';
    };
    renderPaused(dom) {
        dom.pause.style.display    = 'none';
        // dom.back.style.display = 'none';
        dom.lap.style.display      = 'none';
        dom.start.style.display    = 'inline-block';
        dom.stop.style.display     = 'inline-block';
    };
    renderStopped(dom) {
        dom.pause.style.display  = 'none';
        dom.lap.style.display    = 'none';
        dom.back.style.display   = 'none';
        dom.stop.style.display   = 'none';
        dom.save.style.display   = 'inline-block';
        // dom.workout.style.display = 'inline-block';
        dom.start.style.display  = 'inline-block';
    };
    renderWorkoutStarted(dom) {
        // dom.workout.style.display = 'none';
    };
}

customElements.define('watch-control', Watch);

export { Watch };
