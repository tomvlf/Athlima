/*
 * Shows the popup for choosing an ANT+ wireless trainer or sensor.
 * Device-search messages supply discovered devices; tapping a row sends its
 * device number to the app. This view does not scan or pair hardware itself.
 *
 * The browser calls connectedCallback when the popup joins the page, and
 * disconnectedCallback when it leaves. The constructor finds its existing controls.
 */

import { xf, empty, last } from '../functions.js';
import { models } from '../models/models.js';
import { utils } from '../ant/message.js';

// Owns the popup's selection highlight, discovered-device rows, and visibility.
class Request extends HTMLElement {
    constructor() {
        super();
        this.state = {};

        this.list      = this.querySelector('#request-popup-list');
        this.status    = this.querySelector('#request-popup-status');
        this.cancelBtn = this.querySelector('#request-popup-cancel-btn');
        this.pairBtn   = this.querySelector('#request-popup-pair-btn');
    }
    connectedCallback() {

        xf.sub(`db:antDeviceId`, this.onDeviceId.bind(this));

        xf.sub('db:antSearchList', this.onDeviceFound.bind(this));

        this.list.addEventListener('pointerup', this.onSelect.bind(this));

        xf.sub(`ant:search:started`, this.onSearchStarted.bind(this));
        xf.sub(`ant:search:stopped`, this.onSearchStopped.bind(this));

        xf.sub(`ant:request:pair`, this.onRequestPair.bind(this));
        xf.sub(`ant:request:cancel`, this.onRequestCancel.bind(this));
    }
    disconnectedCallback() {
        this.list.removeEventListener('pointerup', this.onSelect.bind(this));

        document.removeEventListener(`db:antDeviceId`, this.onDeviceId);
        document.removeEventListener(`db:antSearchList`, this.onDeviceId);

        document.removeEventListener(`ant:search:started`, this.onSearchStarted);
        document.removeEventListener(`ant:search:stopped`, this.onSearchStopped);
        document.removeEventListener(`ant:request:pair`, this.onSearchStarted);
        document.removeEventListener(`ant:request:cancel`, this.onSearchStopped);
    }
    onDeviceId(deviceId) {
        this.state.deviceId = deviceId;
    }
    onSearchStarted(e) {
        this.show();
    }
    onSearchStopped(e) {
        this.clear();
        this.hide();
    }
    onRequestPair() {
        if(!this.selected) return;
        this.clear();
        this.hide();
    }
    onRequestCancel() {
        this.clear();
        this.hide();
    }
    // Search results arrive as a growing list; append only the newest discovery.
    onDeviceFound(searchList) {
        if(!empty(searchList)) {
            this.add(last(searchList));
        }
    }
    // A tap on any child of a device row selects that row and announces its ID.
    onSelect(e) {
        const el = e.target.closest('.device-chooser-item');
        const els = this.list.querySelectorAll('.device-chooser-item');

        if(el === undefined || el === null) return;
        if(el.id === undefined) return;

        const id = el.id;
        this.state.selected = id;

        els.forEach(el => el.style.backgroundColor = '#fff');
        el.style.backgroundColor = '#efefef';
        console.log(`:view :device-selected ${id}`);
        xf.dispatch(`ui:ant:request:selected`, id);
    }
    show() {
        this.style.display = 'block';
    }
    hide() {
        this.style.display = 'none';
    }
    clear() {
        this.list.innerHTML = ``;
    }
    add(device) {
        this.list.insertAdjacentHTML('beforeend', item(device));
    }
}


// Turn a discovered device number and type code into one readable chooser row.
function item(args) {
    let deviceType = utils.deviceTypeToString(args.deviceType);

    return `<div class="device-chooser-item" id="${args.deviceNumber}">
            <div class="device-connection-type t2">ANT+</div>
            <div class="device-number t3">${args.deviceNumber}</div>
            <div class="device-type t2">${deviceType}</div>
         </div>`;
};

customElements.define('request-popup', Request);

export { Request };
