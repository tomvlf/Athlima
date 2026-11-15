/*
 * Connect buttons and status lights for trainers/sensors, plus an ANT+ chooser.
 * A tap sends an app message; connection/search results update the visible controls.
 * The wireless communication itself happens in the device modules.
 *
 * The browser calls constructors to prepare state, connectedCallback on page entry,
 * and disconnectedCallback on removal. An AbortController lets each control cancel
 * all its registered listeners together when it leaves the page.
 */

import { xf, equals, exists, existance, } from '../functions.js';
import { models } from '../models/models.js';

/**
 * A reusable connect/disconnect control; its for attribute names the device topic.
 * on/off/loading change indicator classes (styling labels), not the connection itself.
 */
class ConnectionSwitch extends HTMLElement {
    constructor() {
        super();
        this.status = 'off';
    }
    getDefaults() {
        return {
            class: {
                on: 'on',
                off: 'off',
                loading: 'loading',
                indicator: 'connection-switch--indicator',
            },
        };
    }
    connectedCallback() {
        const self = this;
        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };

        this.for            = this.getAttribute('for');
        this.onClass        = existance(this.getAttribute('onClass'), this.getDefaults().class.on);
        this.offClass       = existance(this.getAttribute('offClass'), this.getDefaults().class.off);
        this.loadingClass   = existance(this.getAttribute('loadingClass'), this.getDefaults().class.loading);
        this.indicatorClass = existance(this.getAttribute('indicatorClass'), this.getDefaults().class.indicator);

        this.$indicator = this.querySelector(`.${this.indicatorClass}`) ?? this;

        this.addEventListener('pointerup', this.onEffect.bind(this), this.signal);
        xf.sub(`${this.for}:connected`,    this.on.bind(this), this.signal);
        xf.sub(`${this.for}:disconnected`, this.off.bind(this), this.signal);
        xf.sub(`${this.for}:connecting`,   this.loading.bind(this), this.signal);
    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    defaultOnClass() {
        return ;
    }
    defaultOffClass() {
        return ;
    }
    defaultLoadingClass() {
        return ;
    }
    defaultIndicatorClass() {
        return ;
    }
    onEffect(e) {
        xf.dispatch(`ui:${this.for}:switch`);
    }
    on(e) {
        this.$indicator.classList.remove(this.loadingClass);
        this.$indicator.classList.remove(this.offClass);
        this.$indicator.classList.add(this.onClass);
        this.status = 'on';
    }
    off(e) {
        this.$indicator.classList.remove(this.loadingClass);
        this.$indicator.classList.remove(this.onClass);
        this.$indicator.classList.add(this.offClass);
        this.status = 'off';
    }
    loading(e) {
        this.$indicator.classList.remove(this.offClass);
        this.$indicator.classList.remove(this.onClass);
        this.$indicator.classList.add(this.loadingClass);
        this.status = 'loading';
    }
}

customElements.define('connection-switch', ConnectionSwitch);

// Ask for confirmation before switching off an active or starting ANT+ driver.
class ProtocolSwitch extends ConnectionSwitch {
    constructor() {
        super();
        this.confirmMsg = "Proceeding will stop the ANT+ driver! Are you sure?";
    }
    getDefaults() {
        return {
            class: {
                on: 'on',
                off: 'off',
                loading: 'loading',
                indicator: 'this',
            },
        };
    }
    onEffect(e) {
        console.log(this.status);
        if(equals(this.status, 'on') || equals(this.status, 'loading')) {
            const proceed = confirm(this.confirmMsg);
            if(proceed) {
                xf.dispatch(`ui:${this.for}:switch`);
            }
        } else {
            xf.dispatch(`ui:${this.for}:switch`);
        }
    }
}

customElements.define('protocol-switch', ProtocolSwitch);

// Choose which device supplies a measurement, such as power from a trainer or meter.
class SourceSwitch extends HTMLElement {
    constructor() {
        super();
        this.prop   = 'db:sources';
        this.effect = 'sources';
    }
    connectedCallback() {
        const self = this;
        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };

        this.path      = this.getAttribute('for');
        this.value     = this.getAttribute('use');
        this.$dataView = this.querySelector('.data-view');
        this.$toggle   = this.querySelector('.toggle--button');

        xf.sub(`${this.prop}`, this.onUpdate.bind(this), this.signal);
        this.addEventListener('pointerup', this.onEffect.bind(this), this.signal);
        this.render();
    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    onUpdate(sources) {
        this.render();
    }
    // Send just this measurement's source change, leaving other source choices alone.
    onEffect(e) {
        const update = {};

        update[this.path] = this.value;

        xf.dispatch(`${this.effect}`, update);
    }
    // Despite these method names, disable marks the chosen source active and enables
    // its readout; enable dims an unselected source and disables its readout updates.
    disable() {
        this.classList.add('active');
        this.$dataView.removeAttribute('disabled');

        if(this.$toggle) {
            this.$toggle.classList.add('active');
        }
    };
    enable() {
        this.classList.remove('active');
        this.$dataView.setAttribute('disabled', '');

        if(this.$toggle) {
            this.$toggle.classList.remove('active');
        }
    }
    render() {
        if(models.sources.isSource(this.path, this.value)) {
            this.disable();
        } else {
            this.enable();
        };
    }
}

customElements.define('source-switch', SourceSwitch);

// Keeps discovered ANT+ device identifiers and lets the rider choose one for pairing.
class ANTDeviceRequest extends HTMLElement {
    constructor() {
        super();
        this.devices = new Map();
        this.selected = undefined;
        this._status = 'closed';
        this.listSelector   = '.device-request--list';
        this.cancelSelector = '#device-request--cancel';
        this.pairSelector   = '#device-request--pair';
    }
    get status() {
        return this._status;
    }
    set status(value) {
        this._status = value;
        console.log(this._status);
    }
    connectedCallback() {
        const self = this;
        this.abortController = new AbortController();
        this.signal = { signal: self.abortController.signal };

        this.$list      = this.querySelector(this.listSelector);
        this.$cancelBtn = this.querySelector(this.cancelSelector);
        this.$pairBtn   = this.querySelector(this.pairSelector);

        xf.sub(`ant:search:start`,  this.onStart.bind(this), this.signal);
        xf.sub(`ant:search:cancel`, this.onCancel.bind(this), this.signal);
        xf.sub(`ant:search:found`,  this.onFound.bind(this), this.signal);

        this.$list.addEventListener(`pointerup`, this.onSelectAction.bind(this), this.signal);
        this.$cancelBtn.addEventListener(`pointerup`, this.onCancelAction.bind(this), this.signal);
        this.$pairBtn.addEventListener(`pointerup`, this.onPairAction.bind(this), this.signal);
    }
    disconnectedCallback() {
        this.abortController.abort();
    }
    onStart() {
        this.open();
    }
    onCancel() {
        this.close();
    }
    onPair() {
        this.pair();
        this.close();
    }
    onFound(channelId) {
        this.add(channelId);
    }
    onLost(device) {
        this.remove(device);
    }
    // Resolve a tap on any child to its device row, then remember the full device ID.
    onSelectAction(e) {
        const el = e.target.closest('.device-request--item');
        const els = this.$list.querySelectorAll('.device-request--item');

        if(el === undefined || el === null) return;
        if(el.id === undefined) return;

        els.forEach(el => el.classList.remove('active'));
        el.classList.add('active');

        this.select(parseInt(el.id));
    }
    onCancelAction() {
        xf.dispatch(`ant:search:cancel`);
    }
    onPairAction() {
        this.pair();
    }
    open() {
        this.status = 'opened';
        this.classList.add('active');
    }
    close() {
        this.status = 'closed';
        this.clear();
        this.classList.remove('active');
    }
    select(deviceNumber) {
        const channelId = this.devices.get(deviceNumber);
        if(!channelId) return;
        this.selected = channelId;
    }
    // Require a selection, close/reset the chooser, then hand the saved ID to pairing.
    pair() {
        if(!this.selected) {
            xf.dispatch('ui:modal:error:open', 'Select an ANT+ device before pairing.');
            return;
        }
        const selected = this.selected;
        this.status = 'pairing';
        this.close();
        xf.dispatch('ant:search:stopped');
        xf.dispatch('ant:search:pair', selected);
    }
    // Display the search result's device number and type in a selectable row.
    deviceItemTemplate(args = { deviceNumber: '--', deviceType: '--'}) {
        return `<div class="device-request--item" id="${args.deviceNumber}">
        <div class="device-request--item--protocol">ANT+</div>
        <div class="device-request--item--number">${args.deviceNumber}</div>
        <div class="device-request--item--type">${args.deviceType}</div>
     </div>`;
    }
    // Search may report a device repeatedly; keep only one row per device number.
    add(channelId) {
        if(this.devices.has(channelId.deviceNumber)) return;

        this.devices.set(channelId.deviceNumber, channelId);
        const item = this.deviceItemTemplate(channelId);
        this.$list.insertAdjacentHTML('beforeend', item);
    }
    remove(device) {
        const item = this.$list.querySelector(`#${device.deviceNumber}`);
        item?.remove();
    }
    clear() {
        this.$list.innerHTML = '';
        this.devices = new Map();
        this.selected = undefined;
    }
}

customElements.define('ant-device-request', ANTDeviceRequest);

export {
    ConnectionSwitch,
    SourceSwitch,
}
