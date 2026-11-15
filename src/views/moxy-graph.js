/*
 * Draws a scrolling live chart of muscle oxygen (SmO2), total haemoglobin (THb),
 * heart rate, and power. Each line has its own scale so different units can share
 * one picture. Sensor messages refresh values; timer ticks add points to the lines.
 *
 * SVG draws each line from an x/y point list rather than an image file.
 * connectedCallback finds those lines and starts listening when the custom tag
 * joins the page; disconnectedCallback cancels listeners when it leaves.
 */

import { xf, exists, clamp, debounce } from '../functions.js';
import { translate } from '../utils.js';
import { models } from '../models/models.js';

// Holds recent screen coordinates and the latest sensor value for each coloured line.
class MoxyGraph extends HTMLElement {
    constructor() {
        super();
        const self = this;

        this.Key = {
            smo2: 'smo2',
            thb: 'thb',
            heartRate: 'heartRate',
            power: 'power',
        };

        // Moxy defined ranges and color codes:
        //
        // SmO2 range: 0 - 100,   step: 0.1, <30% - blue, 30%-70% - green, >70% red
        // THb  range: 0 - 40.00, step: 0.01, 8.0 - 15.0, orange
        //
        // We are going to use just green for SmO2, because we are going to add
        // HeartRate layer and it is going to be red and we don't want those to clash

        // initial state
        this.smo2 = {value: 0, x: 0, min: 0, max: 100};
        this.thb = {value: 0, x: 0, min: 8, max: 15};
        this.heartRate = {value: 0, x: 0, min: 30, max: 200};
        this.power = {value: 0, x: 0, min: 0, max: 600};

        this.path = {smo2: [], thb: [], heartRate: [], power: []};
        this.$path = {};
        this.xAxis = {min: 0, max: 100};
        this.yAxis = {min: 0, max: 100};
        this.step = 1;
        this.width = 0;
        this.x = 0;

        // configurations
        this.prop = {
            elapsed: 'watch:elapsed',
            smo2: 'db:smo2',
            thb: 'db:thb',
            heartRate: 'db:heartRate',
            power: 'db:power1s',
        };
        this.selectors = {
            svg: '#moxy-svg',
            path: {
                smo2: '#moxy-path-smo2',
                thb: '#moxy-path-thb',
                heartRate: '#moxy-path-hr',
                power: '#moxy-path-power',
            },
        };
        this.color = {
            smo2: '#57C057',
            thb: '#FF663A',
            heartRate: '#FE340B',
            power: '#F8C73A',
        };
        this.stroke = {
            all: 1,
        };
        this.handlers = {
            smo2:      (value) => self.smo2.value = value,
            heartRate: (value) => self.heartRate.value = value,
            power:     (value) => self.power.value = value,
            thb:       (value) => {
                self.adjustYMinMaxFor('thb', value);
                self.thb.value = value;
            }
        };

        this.postInit();
    }
    postInit() {
        // overwrite in child classes
    }
    connectedCallback() {
        const self = this;
        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };

        this.$cont = document.querySelector('#graph-power') ?? this;
        this.$svg  = this.querySelector(this.selectors.svg);

        this.width = this.calcWidth();

        for(let key in this.Key) {
            // this.path[key] = [];
            this.$path[key] = this.querySelector(this.selectors.path[key]);
            this.$path[key].setAttribute('stroke', this.color[key]);
            xf.sub(`${this.prop[key]}`, this.handlers[key].bind(this), this.signal);
        }

        xf.sub(`${this.prop.elapsed}`, this.onElapsed.bind(this), this.signal);
        window.addEventListener(`resize`, this.onResize.bind(this), this.signal);
    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    calcWidth() {
        return this.$cont.getBoundingClientRect()?.width ?? window.innerWidth;
    }
    onResize() {
        // TODO: debounce
        this.width = this.calcWidth();
    }
    // Start THb's scale around its first reading, then expand it for new extremes.
    adjustYMinMaxFor(key, value) {
        if(this[key].value === 0) {
            this[key].min = value - 1;
            this[key].max = value + 1;
        }
        // this[key].value = value;
        if(value < this[key].min) {
            this[key].min = value;
        }
        if(value > this[key].max) {
            this[key].max = value;
        }
    }
    // Sample all four latest readings at the same timer tick before advancing time.
    onElapsed() {
        // first calculate
        for(let key in this.path) {
            this.calcStep(key);
        }

        // render all
        for(let key in this.path) {
            this.renderStep(key);
        }

        // move x to the right for the next elapsed interval
        this.x += this.step;
    }
    // this.smo2 =      {value: 0, x: 0, min:  0, max: 100};
    // this.thb =       {value: 0, x: 0, min:  8, max:  15};
    // this.heartRate = {value: 0, x: 0, min: 30, max: 200};
    // this.power =     {value: 0, x: 0, min:  0, max: 600};
    // this.xAxis =     {min: 0, max: 100};
    // this.yAxis =     {min: 0, max: 100};
    // Map a number's position in one range to the same position in another range.
    translate(value, inMin, inMax, outMin, outMax) {
        return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
    }
    // Limit readings to their scale and flip y: SVG's zero is at the top, not bottom.
    translateY(key, value) {
        return this.yAxis.max - this.translate(
            clamp(this[key].min, this[key].max, value),
            this[key].min,
            this[key].max,
            this.yAxis.min,
            this.yAxis.max
        );
    }
    /**
     * Add the next point to a flat [x, y, x, y, ...] list.
     * Once the visible width is full, shift old readings away; after a shrink,
     * discard enough old points to fit and re-number their horizontal positions.
     */
    calcStep(key) {
        const y = this.translateY(key, this[key].value);
        let length = this.path[key].length;

        if((length / 2) >= (this.width / this.step)) {
            const diff = (length / 2) - (this.width / this.step);

            if(diff >= 2) {
                length = this.width * 2;
                // splice window diff from the front and account for the one shift
                this.path[key].splice(0, (diff*2)+2);
                // shift path x values to start from 0
                for(let i = 0, j = 0; i < length; i+=1) {
                    if(i % 2 == 0) {
                        this.path[key][i] = j;
                        j+=1;
                    };
                }
                this.x = (length/2) - 1;
                // shift
                this.path[key][length-2] = this.x;
                this.path[key][length-1] = y;
            } else {
                // when xAxis.max is reached,
                // shift in place 2 positions back
                // and set the last 2 position with the new data
                for(let i = 2; i < length; i+=1) {
                    if(i % 2 !== 0) {
                        this.path[key][i-2] = this.path[key][i];
                    };
                }
                // update x to the new smaller length and
                // compansate for the shift with - 1
                this.x = (length/2) - 1;
                // shift
                this.path[key][length-2] = this.x;
                this.path[key][length-1] = y;
            }
        } else {
            // push until xAxis.max is reached
            this.path[key].push(this.x);
            this.path[key].push(y);
        }
    }
    // Give the browser the updated coordinate list for one SVG line.
    renderStep(key) {
        const points = this.path[key].join(',');
        this.$path[key].setAttribute('points', points);
    }
}

customElements.define('moxy-graph', MoxyGraph);

export {
    MoxyGraph,
}
