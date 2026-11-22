/*
 * Displays the workout library with expandable descriptions and graph previews.
 * WorkoutList receives workouts and FTP (the rider's reference power); each
 * WorkoutListItem sends selection/deletion requests and shows graph hover details.
 *
 * Constructors prepare state, connectedCallback attaches listeners on page entry,
 * and disconnectedCallback cancels them. render replaces the list's HTML.
 * Imported names/descriptions are escaped so the browser displays them as text.
 * Previews use HTML bars for intervals or SVG shapes for routes; SVG icons are
 * also pictures described by shapes rather than image files.
 */

import { xf, exists, empty, equals, debounce } from '../functions.js';
import { html, raw, setHTML } from '../html.js';
import { models } from '../models/models.js';
import { intervalsToGraph, courseToGraph, renderInfo } from './workout-graph.js';

const radioOff = html`
        <svg class="radio radio-off">
            <use href="#icon--radio-off">
        </svg>`;

const radioOn = html`
        <svg class="radio radio-on">
            <use href="#icon--radio-on">
        </svg>`;

const options = html`
        <svg class="workout--options-btn control--btn--icon">
            <use href="#icon--options">
        </svg>`;

// Return one card's HTML using a prepared graph and selection flag; routes show km.
function workoutTemplate(workout) {
    let duration = '';
    if(workout.meta.duration) {
        duration = `${Math.round(workout.meta.duration / 60)} min`;
    }
    if(workout.meta.distance) {
        duration = `${(workout.meta.distance / 1000).toFixed(2)} km`;
    }
    return html`<workout-item class='workout cf' id="${workout.id}" metric="ftp">
                <div class="workout--info">
                    <div class="workout--short-info">
                        <div class="workout--summary">
                            <div class="workout--name">${workout.meta.name}</div>
                            <div class="workout--type">${workout.meta.category}</div>
                            <div class="workout--duration">${duration}</div>
                            <div class="workout--select" id="btn${workout.id}">${workout.selected ? radioOn : radioOff}
                            </div>
                            <div class="workout--options">${options}</div>
                        </div>
                    </div>
                    <div class="workout--full-info">
                        <div class="workout-list--graph-cont">${workout.graph}</div>
                        <div class="workout--description">${workout.meta.description}</div>
                    </div>
                </div>
                <div class="workout--actions">
                    <span class="workout--remove">Delete</span>
                </div>
            </workout-item>`;
}

// Keeps the library's displayed charts in step with workouts and reference power.
class WorkoutList extends HTMLElement {
    constructor() {
        super();
        this.state = [];
        this.ftp = 0;
        this.items = [];
        this.postInit();
        this.workout = {};
    }
    postInit() { return; }
    connectedCallback() {
        const self = this;
        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };

        xf.sub(`db:workouts`, this.onWorkouts.bind(this), this.signal);
        xf.sub('db:workout',  this.onWorkout.bind(this), this.signal); // ?
        xf.sub(`db:ftp`,      this.onFTP.bind(this), this.signal);
    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    getWidth() {
        return window.innerWidth;
    }
    onWorkout(value) {
        this.workout = value;
    }
    onFTP(value) {
        if(!equals(value, this.ftp)) {
            this.ftp = value;
            if(!empty(this.state)) {
                this.render();
            }
        }
    }
    onWorkouts(value) {
        this.state = value;
        this.render();
    }
    // Size previews from the window width and eight lines of the page's text size.
    getViewPort() {
        const self = this;

        const $el = document.querySelector('#workouts-page');
        const fontSize = parseInt(window.getComputedStyle($el).getPropertyValue('font-size'));
        const em = 8;

        const width = self.getWidth();
        const height = fontSize * em;
        const aspectRatio = width / height;


        return {
            height,
            width,
            aspectRatio,
        };
    }
    // Build each interval/route graph, attach graph and selected fields to its workout,
    // and join the resulting cards into a single HTML string.
    stateToHtml(state, ftp, selectedWorkout) {
        const self = this;
        const viewPort = this.getViewPort();

        return state.reduce((acc, workout, i) => {
            let graph = '';

            if(exists(workout.intervals)) {
                graph = intervalsToGraph(workout, ftp, viewPort);
            } else {
                graph = courseToGraph(workout, viewPort);
            }

            const selected = equals(workout.id, selectedWorkout.id);
            workout = Object.assign(workout, {graph: graph, selected: selected});
            return acc + String(workoutTemplate(workout));
        }, '');
    }
    render() {
        setHTML(this, raw(this.stateToHtml(this.state, this.ftp, this.workout)));
    }
}



/**
 * Handles one library row: expand/collapse details, show/hide its menu, and select it.
 * These paired helpers only change display state; ui: requests ask the app to act.
 */
class WorkoutListItem extends HTMLElement {
    constructor() {
        super();
        this.state = '';
        this.isExpanded = false;
        this.isSelected = false;
        this.optionsActive = false;
    }
    connectedCallback() {
        const self = this;
        this.infoCont = this.querySelector('.workout--info');
        this.summary = this.querySelector('.workout--summary');
        this.description = this.querySelector('.workout--full-info');
        this.selectBtn = this.querySelector('.workout--select');
        this.optionsBtn = this.querySelector('.workout--options');
        this.removeBtn = this.querySelector('.workout--remove');
        this.indicator = this.selectBtn;
        this.id = this.getAttribute('id');

        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };

        this.debounced = {
            onWindowResize: debounce(
                self.onWindowResize.bind(this), 300, {trailing: true, leading: false},
            ),
        };

        this.dom = {};
        this.dom.info = this.querySelector('.graph--info--cont');
        this.dom.cont = this.querySelector('.workout-list--graph-cont');
        this.viewPort = this.getViewPort();

        xf.sub('db:workout', this.onWorkout.bind(this), this.signal);
        this.summary.addEventListener('pointerup', this.toggleExpand.bind(this), this.signal);
        this.optionsBtn.addEventListener('pointerup', this.toggleOptions.bind(this), this.signal);
        this.selectBtn.addEventListener('pointerup', this.onRadio.bind(this), this.signal);

        this.removeBtn.addEventListener('pointerup', this.onRemove.bind(this), this.signal);

        this.addEventListener('mouseover', this.onHover.bind(this), this.signal);
        this.addEventListener('mouseout', this.onMouseOut.bind(this), this.signal);
        window.addEventListener('resize', this.debounced.onWindowResize.bind(this), this.signal);

    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    // Keep opening the options menu from also toggling the workout's details.
    toggleExpand(e) {
        if(e.target.classList.contains('workout--options')) {
            return;
        }
        if(this.isExpanded) {
            this.collapse();
        } else {
            this.expand();
        }
    }
    expand() {
        this.description.style.display = 'block';
        this.isExpanded = true;
    }
    collapse() {
        this.description.style.display = 'none';
        this.isExpanded = false;
    }
    // Reflect the app's chosen workout; selecting this row also reveals its details.
    toggleSelect(id) {
        if(equals(this.id, id)) {
            if(!this.isSelected) {
                this.select();
                this.expand();
            }
        } else {
            this.diselect();
        }
    }
    select() {
        setHTML(this.indicator, html`${radioOn}`);
        this.isSelected = true;
    }
    diselect() {
        setHTML(this.indicator, html`${radioOff}`);
        this.isSelected = false;
    }
    toggleOptions() {
        if(this.optionsActive) {
            this.hideOptions();
        } else {
            this.showOptions();
        }
    }
    showOptions() {
        this.infoCont.classList.remove('options-hide');
        this.infoCont.classList.add('options-show');
        this.optionsActive = true;
    }
    hideOptions() {
        this.infoCont.classList.remove('options-show');
        this.infoCont.classList.add('options-hide');
        this.optionsActive = false;
    }
    onWorkout(workout) {
        this.workout = workout;
        this.toggleSelect(workout.id);
    }
    // Stop the tap reaching the summary, which would also expand/collapse the row.
    onRadio(e) {
        e.stopPropagation();
        xf.dispatch('ui:workout:select', this.id);
    }
    onRemove(e) {
        console.log(`:ui :workout :remove :id '${this.id}'`);
        xf.dispatch('ui:workout:remove', this.id);
    }
    onUpdate(value) {
        if(!equals(value, this.state)) {
            this.state = value;
            this.render();
        }
    }
    // Read the hovered SVG bar's stored targets and position a tooltip inside the graph.
    onHover(e) {
        const self = this;
        const target = this.querySelector('.graph--bar:hover');
        if(exists(target)) {
            const power        = target.getAttribute('power');
            const cadence      = target.getAttribute('cadence');
            const slope        = target.getAttribute('slope');
            const duration     = target.getAttribute('duration');
            const distance     = target.getAttribute('distance');
            const intervalRect = target.getBoundingClientRect();
            this.viewPort      = this.getViewPort(); // move to more sensible event

            this.renderInfo({
                power,
                cadence,
                slope,
                duration,
                distance,
                intervalRect,
                contRect: self.viewPort,
                dom: self.dom,
            });
        }
    }
    onMouseOut(e) {
        this.dom.info.style.display = 'none';
    }
    // Measure the actual card graph, including its page offset for tooltip positioning.
    getViewPort() {
        const rect = this.dom.cont.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height,
            left: rect.left,
            aspectRatio: rect.width / rect.height,
        };
    }
    onWindowResize(e) {
        this.viewPort = this.getViewPort();
    }
    render() {}
    renderInfo(args = {}) {
        renderInfo(args);
    }
}

customElements.define('workout-list', WorkoutList);
customElements.define('workout-item', WorkoutListItem);

export {
    radioOff,
    radioOn,
    options,
    workoutTemplate,
};

