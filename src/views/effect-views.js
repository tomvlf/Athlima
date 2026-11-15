/*
 * Gives ordinary form inputs and buttons app-specific behavior.
 * The prop attribute names data to display; effect names the ui: request to send
 * after an edit or tap. The app, rather than these controls, handles persistence.
 *
 * These classes extend built-in HTML controls, used with is="int-input", etc.
 * Constructors read settings, connectedCallback listens when a control joins
 * the page, and disconnectedCallback is its cleanup hook. render writes the
 * displayed value; onChange parses a user's text before sending an action.
 */

import { xf, exists, equals } from '../functions.js';
import { models } from '../models/models.js';

// Whole-number input synchronized with app data; subclasses customize parsing/display.
class IntInput extends HTMLInputElement {
    constructor() {
        super();
        this.state = 0;
        this.prop = this.getAttribute('prop');
        this.effect = this.getAttribute('effect');
        this.postInit();
    }
    postInit() { return; }
    connectedCallback() {
        this.addEventListener('change', this.onChange.bind(this));
        xf.sub(`db:${this.prop}`, this.onUpdate.bind(this));
    }
    disconnectedCallback() {
        document.removeEventListener(`db:${this.prop}`, this.onUpdate);
        this.removeEventListener('change', this.onChange);
    }
    onUpdate(value) {
        if(!equals(value, this.state)) {
            this.state = value;
            this.render();
        }
    }
    onChange(e) {
        this.state = parseInt(e.target.value);
        xf.dispatch(`ui:${this.effect}`, this.state);
    }
    render() {
        this.value = this.state;
    }
}

// Decimal input; points controls how many decimal places are shown.
class FloatInput extends IntInput {
    postInit() {
        this.points = this.getAttribute('points') || 2;
    }
    onChange(e) {
        this.state = parseFloat(e.target.value);
        xf.dispatch(`ui:${this.effect}`, this.state);
    }
    render() {
        this.value = (this.state).toFixed(this.points);
    }
}

// Store weight in kilograms while allowing the rider to view and enter pounds.
class WeightInput extends IntInput {
    postInit() {
        this.measurement = models.measurement.default;
        xf.sub(`db:measurement`, this.onMeasurement.bind(this));
    }
    onMeasurement(measurement) {
        this.measurement = measurement;
        this.render();
    }
    kgToLbs(kg) {
        return Math.round(2.20462 * kg);
    };
    // Convert the entered unit back to whole kilograms before notifying the app.
    parseKg(weight) {
        if(this.measurement === 'imperial') {
            return Math.round(0.453592 * weight);
        }
        return Math.round(weight);
    }
    // Convert stored kilograms for display only; changing units does not change weight.
    formatWeight(value, measurement) {
        if(measurement === 'imperial') {
            value = `${this.kgToLbs(value)}`;
        } else {
            value = `${value}`;
        }
        return value;
    }
    onChange(e) {
        this.state = this.parseKg(e.target.value);
        xf.dispatch(`ui:${this.effect}`, this.state);
    }
    render() {
        this.value = this.formatWeight(this.state, this.measurement);
    }
}

customElements.define('int-input', IntInput, {extends: 'input'});
customElements.define('float-input', FloatInput, {extends: 'input'});
customElements.define('weight-input', WeightInput, {extends: 'input'});

// A tap requests a named action with no extra value.
class EffectButton extends HTMLButtonElement {
    constructor() {
        super();
        this.effect = this.getAttribute('effect');
    }
    connectedCallback() {
        this.addEventListener('pointerup', this.onEffect.bind(this));
    }
    disconnectedCallback() {
        this.removeEventListener('pointerup', this.onEffect);
    }
    onEffect(e) {
        xf.dispatch(`ui:${this.effect}`);
    }
}

customElements.define('effect-button', EffectButton, {extends: 'button'});

// A tap submits the latest value of another app setting as a whole number.
class SetButton extends HTMLButtonElement {
    constructor() {
        super();
        this.effect = this.getAttribute('effect');
        this.prop = this.getAttribute('prop');
        this.state = 0;
    }
    connectedCallback() {
        xf.sub(`db:${this.prop}`, this.onUpdate.bind(this));
        this.addEventListener('pointerup', this.onEffect.bind(this));
    }
    disconnectedCallback() {
        this.removeEventListener('pointerup', this.onEffect);
    }
    onEffect(e) {
        xf.dispatch(`ui:${this.effect}`, parseInt(this.state));
    }
    onUpdate(value) {
        this.state = value;
    }
}

customElements.define('set-button', SetButton, {extends: 'button'});

// Pass the browser's selected files to the workout importer without reading them here.
class Upload extends HTMLInputElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.addEventListener('change', this.onSubmit.bind(this));
    }
    disconnectedCallback() {
        this.removeEventListener(`pointerup`, this.onSubmit);
    }
    onSubmit(e) {
        const files = e.target.files;
        xf.dispatch('ui:workout:upload', files);
    }
}

customElements.define('workout-upload', Upload, {extends: 'input'});


export { IntInput, FloatInput, EffectButton };
