/**
 * Historical manual trainer-simulation sketch, not an automatically run Jest test or an active app
 * module. It emits invented sensor values without physical hardware; constructor startup is
 * disabled. Review its legacy import path and event names before wiring it into a development page.
 * Never treat the generated heart rate or power as an athlete measurement.
 */

import { xf, equals, rand } from './functions.js';

/**
 * Hold pretend trainer/sensor readings and publish them through the event bus when explicitly
 * initialized and started.
 */
class TrainerMock {
    /**
     * Set sample targets, readings and power-zone cutoffs without attaching listeners or starting a
     * timer.
     */
    constructor() {
        this.defaults = {
            powerTarget: 220,
            slope: 0,
            ftp: 256,
        };
        this.powerTarget = this.defaults.powerTarget;
        this.slope = this.defaults.slope;
        this.ftp = this.defaults.ftp;

        this.cadence = 80;
        this.power = 220;
        this.speed = 20;
        this.heartRate = 140;

        this.zones = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
        this.percentages = {
            'one': 0.54, 'two': 0.75, 'three': 0.87,
            'four': 0.94, 'five': 1.05, 'six': 1.20,
        };
        // this.init();
    }
    /**
     * Attach target and ride-control listeners, announce pretend device connections and print a
     * prominent simulation warning.
     */
    init() {
        const self = this;

        xf.sub('db:powerTarget', self.onPowerTarget.bind(self));
        xf.sub('db:slopeTarget', self.onSlopeTarget.bind(self));
        xf.sub('db:ftp', self.onFTP.bind(self));

        xf.sub('ui:workoutStart', self.run.bind(self));
        xf.sub('ui:watchStart', self.run.bind(self));
        xf.sub('ui:watchResume', self.run.bind(self));
        xf.sub('ui:watchPause', self.stop.bind(self));

        self.id = 'ble:controllable';
        self.name = 'Tacx Flux 46731';

        xf.dispatch(`${self.id}:connected`);
        xf.dispatch(`${self.id}:name`, self.name);

        self.hrId = 'ble:hrm';
        self.hrName = 'Tacx HRB 20483';

        xf.dispatch(`${self.hrId}:connected`);
        xf.dispatch(`${self.hrId}:name`, self.hrName);

        console.warn('|------------------------|');
        console.warn('|Trainer Mock Data is ON!|');
        console.warn('|------------------------|');
    }
    /**
     * Start periodic sample publication; callers are responsible for not starting overlapping
     * timers.
     */
    run() {
        const self = this;
        self.interval = self.broadcast(self.indoorBikeData.bind(self));
    }
    /** Stop the currently remembered publication timer without resetting the pretend readings. */
    stop() {
        const self = this;
        clearInterval(self.interval);
    }
    /**
     * Schedule the supplied sample handler every 250 milliseconds and return its timer ID for later
     * cancellation.
     */
    broadcast(handler) {
        // broadcast interval in ms
        const interval = setInterval(handler, 250);
        // const interval = setInterval(handler, 1000);
        return interval;
    }
    /**
     * Generate the next sample and announce power, heart rate, cadence and fixed speed as separate
     * events.
     */
    indoorBikeData() {
        const self = this;
        self.power = this.powerNext(self.power);
        self.heartRate = this.heartRateNext(self.heartRate);
        self.cadence = this.cadenceNext(self.cadence);
        self.speed = 20;

        xf.dispatch('power', self.power);
        xf.dispatch('heartRate', self.heartRate);
        xf.dispatch('cadence', self.cadence);
        xf.dispatch('speed', self.speed);
    }
    /**
     * Update the pretend power and choose a rough heart-rate starting point from the new target;
     * this is not a physiological model.
     */
    onPowerTarget(powerTarget) {
        this.powerTarget = powerTarget;
        this.power = powerTarget > 0 ? powerTarget : this.defaults.powerTarget;
        this.heartRate = this.powerToHeartRate(powerTarget, this.ftp, this.zones);
    }
    onSlopeTarget(slope) {
        this.slope = slope;
    }
    onFTP(ftp) {
        this.ftp = ftp;
    }
    /**
     * Return the target directly; the previous sample is deliberately not used to simulate
     * acceleration or sensor noise.
     */
    powerNext(prev) {
        return this.powerTarget;
    }
    /**
     * Add a small random change to the previous cadence so the development display does not stay
     * perfectly still.
     */
    cadenceNext(prev) {
        return prev + rand(-1, 1);
    }
    /**
     * Add a small random change to the pretend heart rate, without claiming a real response to
     * exercise.
     */
    heartRateNext(prev) {
        return prev + rand(-1, 1);
    }
    /** Choose a made-up display heart rate for the power zone, solely for exercising the interface. */
    powerToHeartRate(power, ftp, zones) {
        let base = 90;
        if(equals(this.powerToZone(power, ftp, zones).name, 'one')) {
            base = 100;
        }
        if(equals(this.powerToZone(power, ftp, zones).name, 'two')) {
            base = 130;
        }
        if(equals(this.powerToZone(power, ftp, zones).name, 'three')) {
            base = 150;
        }
        if(equals(this.powerToZone(power, ftp, zones).name, 'four')) {
            base = 160;
        }
        if(equals(this.powerToZone(power, ftp, zones).name, 'five')) {
            base = 170;
        }
        if(equals(this.powerToZone(power, ftp, zones).name, 'six')) {
            base = 180;
        }
        if(equals(this.powerToZone(power, ftp, zones).name, 'seven')) {
            base = 190;
        }
        return base;
    }
    /** Place power into one of the sample FTP-relative ranges and return its name and position. */
    powerToZone(value, ftp, zones) {
        const self = this;

        let index = 0;
        let name = zones[index];
        if(value < (ftp * self.percentages.one)) {
            index = 0;
            name = zones[index];
        } else if(value < (ftp * self.percentages.two)) {
            index = 1;
            name = zones[index];
        } else if(value < (ftp * self.percentages.three)) {
            index = 2;
            name = zones[index];
        } else if(value < (ftp * self.percentages.four)) {
            index = 3;
            name = zones[index];
        } else if(value < (ftp * self.percentages.five)) {
            index = 4;
            name = zones[index];
        } else if (value < (ftp * self.percentages.six)) {
            index = 5;
            name = zones[index];
        } else {
            index = 6;
            name = zones[index];
        }
        return {name, index};
    }
}

const trainerMock = new TrainerMock();

export { trainerMock };
