/*
 * Loads the screen components and keyboard shortcuts used by the app.
 * Importing these files registers custom HTML tags, such as <watch-control>,
 * so the browser knows which JavaScript class should manage each screen part.
 *
 * Shared pattern: constructor prepares a component; connectedCallback runs when
 * it joins the page; disconnectedCallback is its cleanup hook. Watched HTML
 * attributes trigger attributeChangedCallback. A render method updates what is
 * visible. Through xf, db: messages report data and ui: messages request actions;
 * a button usually sends a request rather than saving or controlling hardware itself.
 */

import './connection-switch.js';
import './data-views.js';
import './effect-views.js';
import './editor.js';
import './tabs.js';
import './workout-list.js';
import './planned-list.js';
import './training-calendar.js';
import './coaching-panel.js';
import './active-list-item.js';
import './activity-list.js';
import './workout-graph.js';
import './moxy-graph.js';
import './watch.js';
import './ant-device-scan.js';
import './keyboard.js';

function start() {
    console.log('start views.');
}

start();
