/*
 * Connects tab buttons to the panels they select, including whole-page tabs.
 * HTML attributes name the action (effect), selected value (param), and stored
 * setting (prop). An "active" CSS class tells the page's styling what to show.
 *
 * Constructors prepare each custom tag; connectedCallback attaches its behavior
 * when the browser adds it to the page. onUpdate receives the chosen stored value.
 */

import { xf } from '../functions.js';

// Sends a selection request on a tap and marks itself active when that value is stored.
class TabBtn extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.state = '';
        this.effect = this.getAttribute('effect') || '';
        this.param = this.getAttribute('param') || '';
        this.prop = this.getAttribute('prop') || false;
        this.addEventListener('pointerup', this.onEffect.bind(this));

        if(this.prop) {
            xf.sub(`db:${this.prop}`, this.onUpdate.bind(this));
            document.removeEventListener(`db:${this.prop}`, this.onUpdate);
        }
    }
    disconnectedCallback() {
        this.removeEventListener('pointerup', this.onEffect);
    }
    onEffect(e) {
        xf.dispatch(`ui:${this.effect}`, this.param);
    }
    onUpdate(state) {
        this.state = state;
        if(this.state === this.param) {
            this.classList.remove('active');
            this.classList.add('active');
        } else {
            this.classList.remove('active');
        }
    }
}

// Applies the stored selection to child panels by matching their tab attribute.
class TabGroup extends HTMLElement {
    constructor() {
        super();
        this.tabClass = this.defaultTabSelector();
        this.tabAttr = this.defaultTabAttr();
        this.prop = this.getAttribute('prop') || '';
        this.tabs = this.querySelectorAll(this.tabClass);
    }
    defaultTabSelector() { return '.tab'; }
    defaultTabAttr() { return 'tab'; }
    connectedCallback() {
        xf.sub(`db:${this.prop}`, this.onUpdate.bind(this));
    }
    disconnectedCallback() {
        document.removeEventListener(`db:${this.prop}`, this.onUpdate);
    }
    onUpdate(param) {
        this.tabs.forEach(tab => {
            if(this.getId(tab) === param) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }
    getId(tab) {
        return tab.getAttribute(this.tabAttr);
    }
}

customElements.define('tab-btn', TabBtn);
customElements.define('tab-group', TabGroup);



// Page navigation uses the same selection rules, but looks for .page and page="...".
class PageBtn extends TabBtn {}
class PageGroup extends TabGroup {
    defaultTabSelector() { return '.page'; }
    defaultTabAttr() { return 'page'; }
}

customElements.define('page-btn', PageBtn);
customElements.define('page-group', PageGroup);

export { TabBtn, TabGroup };
