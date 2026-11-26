/*
 * A table-style workout editor: rows describe duration, power, ramp, slope,
 * and cadence. Row/Editor hold numbers in memory; RowView/WorkoutEditor connect
 * those numbers to the form. Download produces a ZWO workout file for later use.
 *
 * Field helpers encode numbers as readable text and decode typed text back to
 * numbers. The custom tag's constructor prepares the editor; connectedCallback
 * attaches form listeners when it joins the page, and disconnectedCallback cancels
 * its listeners. Rendering only changes the page, not a saved workout library.
 */

import { xf, equals, exists, empty, first, second, last, toFixed } from '../functions.js';
import { models, } from '../models/models.js';
import { formatTime } from '../utils.js';
import { zwo } from '../workouts/zwo.js';
import { fileHandler } from '../file.js';
import { uuid } from '../storage/uuid.js';
import { html, insertHTML } from '../html.js';

// Read the editor's minutes:seconds input as a total number of seconds.
function stringToSeconds(str) {
    const values = str.split(':').map(Number);
    return first(values) * 60 + second(values);
}

// Remove display units such as "%" while retaining digits, minus signs, and decimals.
function toNumericString(str) {
    return str.replace(/[^\d.-]/g, '');
}

// Time field conversions; valid reports whether decoded seconds are greater than zero.
function Duration() {
    function encode(num) {
        return formatTime({value: num, format: 'mm:ss'});
    }
    function decode(str) {
        return stringToSeconds(str);
    }
    function valid(decoded) {
        return decoded > 0;
    }
    return Object.freeze({
        encode,
        decode,
        valid,
    });
}

// Convert between a fraction of FTP (0.8) and displayed percentage (80%).
// FTP is the rider's reference power; missing values use the configured placeholder.
function Power(args = {}) {
    const _defaults = {
        encode: '-',
        decode: 0,
    };

    const defaults = args.defaults ?? _defaults;

    function encode(num) {
        let value = Math.floor(Math.abs(num) * 100);
        if(!exists(value) || isNaN(value)) return defaults.encode;
        return `${value}%`;
    }
    function decode(str) {
        return parseInt(toNumericString(str)) / 100;
    }
    return Object.freeze({
        encode,
        decode
    });
}

// Road gradient stays in percent; display missing values as "-" and decode them as absent.
function Slope(args = {}) {
    function encode(num) {
        let value = parseFloat(num);
        if(!exists(value) || isNaN(value)) {
            return '-';
        }
        return `${toFixed(value, 1)}%`;
    }
    function decode(str) {
        let value = parseFloat(toNumericString(str));
        if(isNaN(value)) return undefined;
        return value;
    }
    return Object.freeze({
        encode,
        decode
    });
}

// Pedalling rate is a whole-number target; a blank/non-number means no cadence target.
function Cadence(args = {}) {
    function encode(num) {
        let value = parseInt(num);
        if(!exists(value) || isNaN(value)) return '-';
        return `${value}`;
    }
    function decode(str) {
        let value = parseInt(toNumericString(str));
        if(isNaN(value)) return undefined;
        return value;
    }
    return Object.freeze({
        encode,
        decode
    });
}

const fields = {
    time: Duration(),
    duration: Duration(),
    power: Power(),
    ramp: Power({defaults: {encode: '-', decode: undefined}}),
    slope: Slope(),
    cadence: Cadence(),
};

/**
 * One editable interval's in-memory numbers and selection flag.
 * Field setters decode input; getters expose values, get returns a copy, and set
 * merges already-decoded data. toView formats the values and toInterval prepares
 * them for the workout player/exporter. None of these helpers writes to storage.
 */
function Row(args = {}) {
    const id = args.id ?? genId();

    let state = {
        time: 0,
        duration: 60 * 10,
        power: 0.0,
        ramp: undefined,
        slope: undefined,
        cadence: undefined,
        powerZone: undefined,
        rampZone: undefined,
        select: false,
    };

    function genId() {
        return uuid();
    }

    function setTime(value) {
        state.time = fields.time.decode(value);
    }

    function setDuration(value) {
        state.duration = fields.duration.decode(value);
    }

    // Ignore non-numeric power edits; valid edits also choose the intensity-zone colour.
    function setPower(value) {
        const percentage = fields.power.decode(value);
        if(isNaN(percentage)) return;
        state.power = percentage;
        state.powerZone = models.ftp.percentageToZone(state.power);
    }

    // A missing ramp end clears the ramp, turning the row back into a steady interval.
    function setRamp(value) {
        const percentage = fields.power.decode(value);
        if(isNaN(percentage)) {
            state.ramp = undefined;
            state.rampZone = '';
        } else {
            state.ramp = percentage;
            state.rampZone = models.ftp.percentageToZone(state.ramp);
        };
    }

    function setSlope(value) {
        const slope = fields.slope.decode(value);
        state.slope = slope;
    }

    function setCadence(value) {
        const cadence = fields.cadence.decode(value);
        state.cadence = cadence;
    }

    function getId() {
        return state.id;
    }

    function getSelect() {
        return state.select;
    }

    function getTime() {
        return state.time;
    }

    function getDuration() {
        return state.duration;
    }

    function getPower() {
        return state.power;
    }

    function getRamp() {
        return state.ramp;
    }

    function getSlope() {
        return state.slope;
    }

    function getCadence() {
        return state.cadence;
    }

    function set(data) {
        state = Object.assign(state, data);
    }

    function get() {
        return Object.assign({}, state);
    }

    function switchSelect() {
        state.select = !state.select;
    }

    // Produce display strings for fields with formatters; leave other entries undefined.
    function toView(data) {
        return Object.keys(data).reduce((acc, key) => {
            acc[key] = fields[key]?.encode(data[key]);
            return acc;
        }, {});
    }

    // Choose a steady step or a sequence approaching the row's ramp-end power.
    function toInterval(row = state) {
        if(exists(row.ramp)) {
            return { duration: row.duration, steps: toRamp(row), };
        } else {
            return { duration: row.duration, steps: [toStep(row)], };
        }
    }

    // Approximate a ramp with whole ten-second steps, carrying optional slope/cadence
    // into each step and rounding relative power to avoid floating-point display noise.
    function toRamp(row) {
        const timeStep = 10;
        const duration = row.duration;
        const stepsCount = parseInt(duration / timeStep);
        const powerStep  = (row.ramp - row.power) / (stepsCount - 1);

        let steps = [];
        let power = row.power;

        for(let i = 0; i < stepsCount; i++) {
            const step = {duration: timeStep, power};
            if(exists(row.slope)) step.slope = row.slope;
            if(exists(row.cadence)) step.cadence = row.cadence;
            steps.push(step);
            power = (power + powerStep);
        }

        const fixedSteps = steps.map((step) => {
            step.power = toFixed(step.power, 2);
            return step;
        });

        return steps;
    }

    // Build the player's step record, omitting targets the rider did not supply.
    function toStep(row) {
        const step = {
            duration: row.duration,
        };
        if(exists(row.power)) step.power = row.power;
        if(exists(row.slope)) step.slope = row.slope;
        if(exists(row.cadence)) step.cadence = row.cadence;
        return step;
    }

    return Object.freeze({
        setDuration,
        setPower,
        setRamp,
        setSlope,
        setCadence,
        getId,
        getSelect,
        getDuration,
        getPower,
        getRamp,
        getSlope,
        getCadence,
        set,
        get,
        switchSelect,
        toView,
        toInterval,
        toStep,
    });
}

// Small row registry keyed by ID; its helpers update and return the same Map.
function Selection(args = {}) {
    const state = new Map();

    function set(rows) {
        rows.forEach(add);
        return state;
    }
    function get() {
        return state;
    }
    function add(row) {
        state.set(row.id, row);
        return state;
    }
    function remove(row) {
        state.delete(row.id);
        return state;
    }
    function clear() {
        state.clear();
        return state;
    }

    return Object.freeze({
        set,
        get,
        add,
        remove,
        clear,
    });
}

// Holds workout metadata and ordered rows; saving assembles a workout in memory.
function Editor() {
    const rows = [];

    let workout = {
        meta: {
            name: 'New Workout',
            author: 'Too Many Watts',
            category: 'SweetSpot',
            description: 'Best workout ever!',
            type: 'bike',
        },
        intervals: [],
    };

    function setName(value) {
        workout.meta.name = value;
    }
    function getName(value) {
        return workout.meta.name;
    }
    function setAuthor(value) {
        workout.meta.author = value;
    }
    function getAuthor(value) {
        return workout.meta.author;
    }
    function setCategory(value) {
        workout.meta.category = value;
    }
    function getCategory(value) {
        return workout.meta.category;
    }
    function setDescription(value) {
        workout.meta.description = value;
    }
    function getDescription(value) {
        return workout.meta.description;
    }
    // Duplicate selected rows (unselected copies), or add one default row if none is selected.
    // Return only the new rows so the view can append them without rebuilding the table.
    function add() {

        const addition = [];

        rows.forEach(row => {
            const selected = row.getSelect();
            if(selected) {
                const r = Row();
                r.set(row.get());
                r.switchSelect();
                rows.push(r);
                addition.push(r);
            }
        });

        if(empty(addition)) {
            const row = Row();
            rows.push(row);
            addition.push(row);
        }

        return addition;
    }
    function remove() {
        rows.pop();
        return rows;
    }
    // Gather current rows into intervals and total duration; this does not persist a file.
    function save() {
        const meta = rows.reduce((acc, row) => {
            acc.duration += row.get().duration;
            return acc;
        }, {duration: 0});

        const intervals = rows.reduce((acc, row) => {
            acc.push(row.toInterval());
            return acc;
        }, []);

        workout.meta = Object.assign(workout.meta, meta);
        workout.intervals = Object.assign(workout.intervals, intervals);

        console.log(workout);
    }
    function format(args = {}) {
        return toZwo(workout);
    }
    // Convert the assembled workout to ZWO, an XML text format used for cycling workouts.
    function toZwo(data) {
        return zwo.write(zwo.fromInterval(data));
    }

    return Object.freeze({
        setName,
        getName,
        setAuthor,
        getAuthor,
        setCategory,
        getCategory,
        setDescription,
        getDescription,
        add,
        remove,
        save,
        format,
        toZwo,
    });
}

/**
 * Binds a Row model to one table row. Input handlers update its numbers;
 * selection and zone renderers change only the matching icons/colours.
 * build returns initial HTML, connect wires an inserted row, and disconnect
 * cancels its listeners before removal.
 */
function RowView(args = {}) {
    const model = args.model;

    const selectors = {
        select: '.select',
        on: '.editor--radio-on',
        off: '.editor--radio-off',
        time: '.time',
        duration: '.duration',
        power: '.power',
        ramp: '.ramp',
        slope: '.slope',
        cadence: '.cadence',
    };

    let $root;
    let $select;
    let $on;
    let $off;
    let $time;
    let $duration;
    let $power;
    let $ramp;
    let $slope;
    let $cadence;

    let abortController;
    let signal;

    function connect($this) {
        $root = $this;
        $select = $root.querySelector(selectors.select);
        $on = $root.querySelector(selectors.on);
        $off = $root.querySelector(selectors.off);
        $time = $root.querySelector(selectors.time);
        $duration = $root.querySelector(selectors.duration);
        $power = $root.querySelector(selectors.power);
        $ramp = $root.querySelector(selectors.ramp);
        $slope = $root.querySelector(selectors.slope);
        $cadence = $root.querySelector(selectors.cadence);

        abortController = new AbortController();
        signal = { signal: abortController.signal };

        $select.addEventListener(`pointerup`, onSelect.bind(this), signal);
        $duration.addEventListener(`input`, onDuration.bind(this), signal);
        $power.addEventListener(`input`, onPower.bind(this), signal);
        $ramp.addEventListener(`input`, onRamp.bind(this), signal);
        $slope.addEventListener(`input`, onSlope.bind(this), signal);
        $cadence.addEventListener(`input`, onCadence.bind(this), signal);

        renderPowerZone();
        renderRampZone();
    }
    function disconnect() {
        abortController.abort();
    }
    function onSelect(e) {
        model.switchSelect();
        const selected = model.getSelect();

        if(selected) {
            select();
        } else {
            unselect();
        }
    }
    function select() {
        $on.classList.add('selected');
        $off.classList.remove('selected');
    }
    function unselect() {
        $on.classList.remove('selected');
        $off.classList.add('selected');
    }
    // Replace the zone part of each target's styling class after its value changes.
    function renderPowerZone() {
        const zoneClass = model.get().powerZone;
        $power.className = $power.className
              .replace(/(\zone.*)/gi, `zone-${zoneClass}-color`);
    }
    function renderRampZone() {
        const zoneClass = model.get().rampZone;
        $ramp.className = $ramp.className
            .replace(/(\zone.*)/gi, `zone-${zoneClass}-color`);
    }
    function onDuration(e) {
        model.setDuration(e.target.value);
    }
    function onPower(e) {
        model.setPower(e.target.value);
        renderPowerZone();
    }
    function onRamp(e) {
        model.setRamp(e.target.value);
        renderRampZone();
    }
    function onSlope(e) {
        model.setSlope(e.target.value);
    }
    function onCadence(e) {
        model.setCadence(e.target.value);
    }
    // Build inputs from the field helpers' numeric display strings, not raw descriptions.
    function template(data) {
        return html`<div class="editor--row">
            <div class="editor--td select">
                <svg class="editor--radio editor--radio-off selected"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24">
                    <path d="M0 0h24v24H0V0z" fill="none"/>
                    <path fill="#none" class="path" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
                </svg>
                <svg class="editor--radio editor--radio-on"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24">
                    <path d="M0 0h24v24H0V0z" fill="none"/>
                    <path class="path" fill="#none" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0
                            18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
                    <circle class="circle" cx="12" cy="12" r="5" fill="#none"/>
                </svg>
            </div>
            <div class="editor--td editor--static time">${data.time}</div>
            <input class="editor--td duration" type="text" value="${data.duration}" />
            <input class="editor--td power zone" type="text" value="${data.power}" />
            <input class="editor--td ramp zone" type="text" value="${data.ramp}" />
            <input class="editor--td slope" type="text" value="${data.slope}" />
            <input class="editor--td cadence" type="text" value="${data.cadence}" />
        </div>`;
    }
    function build() {
        return template(model.toView(model.get()));
    }

    return Object.freeze({
        connect,
        disconnect,
        template,
        build,
    });
}

// Coordinates the overall form, row views, start-time labels, and file download.
class WorkoutEditor extends HTMLElement {
    constructor() {
        super();

        this.selectors = {
            name: '.editor--name',
            author: '.editor--author',
            category: '.editor--category',
            description: '.editor--description',
            body: '.editor--body',
            add: '.editor--add',
            remove: '.editor--remove',
            save: '.editor--save',
            download: '.editor--download',
        };
        this.editor = Editor();
        this.rows = new Map();
    }
    connectedCallback() {
        const self = this;
        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };

        this.$root = this;
        this.$name = this.$root.querySelector(this.selectors.name);
        this.$author = this.$root.querySelector(this.selectors.author);
        this.$category = this.$root.querySelector(this.selectors.category);
        this.$description = this.$root.querySelector(this.selectors.description);
        this.$body = this.$root.querySelector(this.selectors.body);
        this.$add = this.$root.querySelector(this.selectors.add);
        this.$remove = this.$root.querySelector(this.selectors.remove);
        this.$save = this.$root.querySelector(this.selectors.save);
        this.$download = this.$root.querySelector(this.selectors.download);
        this.setTimeRefs();

        this.$body.addEventListener('input', this.setTime.bind(this), this.signal);
        this.$name.addEventListener(`input`, this.onName.bind(this), this.signal);
        this.$author.addEventListener(`input`, this.onAuthor.bind(this), this.signal);
        this.$category.addEventListener(`input`, this.onCategory.bind(this), this.signal);
        this.$description.addEventListener(`input`, this.onDescription.bind(this), this.signal);
        this.$add.addEventListener(`pointerup`, this.onAdd.bind(this), this.signal);
        this.$remove.addEventListener(`pointerup`, this.onRemove.bind(this), this.signal);
        this.$save.addEventListener(`pointerup`, this.onSave.bind(this), this.signal);
        this.$download.addEventListener(`pointerup`, this.onDownload.bind(this), this.signal);

        this.$name.value = this.editor.getName();
        this.$author.value = this.editor.getAuthor();
        this.$category.value = this.editor.getCategory();
        this.$description.value = this.editor.getDescription();

        this.onAdd();
    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    setTimeRefs() {
        this.$durationInputs = this.$body.querySelectorAll('.editor--td.duration');
        this.$timeOutputs = this.$body.querySelectorAll('.editor--td.time');
    }
    // Each row starts after the durations above it; recompute all start-time labels.
    setTime(e) {
        const self = this;
        let acc = 0;
        self.$durationInputs.forEach((input, i) => {
            self.$timeOutputs.item(i).textContent = fields.time.encode(acc);
            acc += fields.duration.decode(input.value);
        });
    }
    onName(e) {
        this.editor.setName(e.target.value);
    }
    onAuthor(e) {
        this.editor.setAuthor(e.target.value);
    }
    onCategory(e) {
        this.editor.setCategory(e.target.value);
    }
    onDescription(e) {
        this.editor.setDescription(e.target.value);
    }
    // Append views for the model's new/copied rows, then refresh cumulative times.
    onAdd(e) {
        // const rowModel = this.editor.add();
        // const rowView = RowView({model: rowModel});
        // this.rows.set(this.rows.size, rowView);
        // insertHTML(this.$body, 'beforeend', rowView.build());
        // const $row = this.$body.lastChild;
        // rowView.connect($row);

        // this.setTimeRefs();
        // this.setTime();

        const rowModels = this.editor.add();

        rowModels.forEach(rowModel => {
            const rowView = RowView({model: rowModel});
            this.rows.set(this.rows.size, rowView);
            insertHTML(this.$body, 'beforeend', rowView.build());
            const $row = this.$body.lastChild;
            rowView.connect($row);

            this.setTimeRefs();
            this.setTime();
        });

    }
    // Remove the last row from the model and page, cancelling that row's input listeners.
    onRemove(e) {
        if(this.rows.size > 0) {
            this.editor.remove();
            const $row = this.$body.lastChild;
            const rowView = this.rows.get(this.rows.size-1);
            rowView.disconnect();
            $row.remove();

            this.setTimeRefs();
            this.setTime();
        }
    }
    // Validation is not implemented here yet; the requested save/download runs directly.
    validate(fn) {
        // const { isValid, errors } = this.editor.validate();
        // if(isValid) {
        //     fn();
        // } else {
        //     this.onError(errors);
        // }

        fn();
    }
    onError(errors) {
    }
    onSave() {
        this.validate(this.save.bind(this));
    }
    onDownload() {
        this.validate(this.download.bind(this));
    }
    save() {
        this.editor.save();
    }
    // Assemble current edits and ask the browser to download a named .zwo text file.
    download() {
        this.editor.save();
        const file = this.editor.format({format: 'zwo'});
        const name = `${this.editor.getName()}.zwo`;
        console.log(file);
        fileHandler.download()(file, name, fileHandler.Type.TextPlain);
    }
}

customElements.define('workout-editor', WorkoutEditor);

export { Editor };

