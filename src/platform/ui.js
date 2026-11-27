/**
 * Assembles the main interface around the ride engine and existing custom screen elements. A route
 * is the page name after #/ in the address; rendering builds that page's HTML, while ride readings
 * update in place to avoid rebuilding controls each second. Mobile layout is selected at 700 pixels
 * or less and can change without restarting a ride. Markup is built with `html`, so user/provider
 * text is inserted as text, and every DOM sink goes through `setHTML`/`insertHTML`.
 */

import { xf } from '../functions.js';
import intervals from '../models/intervals.js';
import { coachingData, coachingService } from '../coaching/service.js';
import { toAppWorkout } from '../coaching/workouts.js';
import { GOALS, RUN_GOALS, addDays, localDay, sportForGoalType } from '../coaching/domain.js';
import { describeRunPaces, formatPace, paceForIntensity } from '../coaching/running.js';
import { todayRecommendation, visibleCoachText } from '../coaching/microcycle-summary.js';
import { DAILY_GOAL_LABELS, DAILY_HORIZONS, normalizeQuickGoal, quickProfile, missingQuickProfileFields, quickGoalTypes } from '../coaching/daily-coach.js';
import { escape, cadenceSummary, minutes, number, time, today, trainingSummary, profileGraph, mobileDetails } from './format.js';
import { html, raw, setHTML, insertHTML } from '../html.js';
import { activityLists, historyActivityRow, localActivityRow, renderActivityOverview, renderActivityStreamData } from './activities.js';
import { initialLibraryFilters, renderLibrary } from './library.js';
import { renderPlan } from './plan-view.js';
import { ridePowerZone, rideTimeline, ridePosition, rideProfile } from './ride.js';
import { mountVersions, versionMarkup } from './version.js';
import { requestPersistentStorage, storageStatus } from '../storage/persist.js';
import { routes, mobileTabs, moreRoutes, openOnMobile, parsePlatformRoute } from './router.js';
import { APP_EVENTS, COACH_EVENTS, ACTIVITY_EVENTS, DB_EVENTS } from '../state/events.js';
const icon = paths => html`<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${raw(paths)}</svg>`;
const dot = (x, y) => html`<circle cx="${x}" cy="${y}" r="1.6" fill="currentColor" stroke="none"/>`;
const icons = {
    dashboard: icon('<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>'),
    calendar: icon('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    player: icon('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16h5.5L9.5 9h6L18 16M6 16 9.5 9M11.5 16l4-7M9.5 9l-.4-1.5M7.6 7.5h3M15.5 9 15 6.5h2"/>'),
    coach: icon('<path d="M4 5h16v11h-9l-4 4v-4H4z"/><path d="M8 9h8M8 12.5h5"/>'),
    more: icon(`${dot(5.5, 12)}${dot(12, 12)}${dot(18.5, 12)}`),
    plan: icon('<path d="M5 21V4"/><path d="M5 4.5h11.5l-2.2 3.75 2.2 3.75H5"/>'),
    library: icon(`<path d="M9 6.5h11M9 12h11M9 17.5h11"/>${dot(4.5, 6.5)}${dot(4.5, 12)}${dot(4.5, 17.5)}`),
    activities: icon('<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>'),
    progress: icon('<path d="M6 19v-6M12 19V6M18 19v-9"/>'),
    devices: icon('<path d="M7 7.5 17 16.5l-5 4.5v-18l5 4.5L7 16.5"/>'),
    settings: icon('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
};
const devices = {
    controllable: 'Smart trainer', heartRateMonitor: 'Heart rate',
    powerMeter: 'Power meter', speedCadenceSensor: 'Speed / cadence',
};
/**
 * These small helpers assemble repeated HTML fragments such as cards, links and statistics.
 * Callers pass fragments produced by `html`; text is escaped automatically.
 */
const card = (title, body, className = '', compact = false) => html`<section class="panel ${className}">${compact
    ? mobileDetails(title, title, html`<h2 class="desktop-section-title">${title}</h2>${body}`)
    : html`<h2>${title}</h2>${body}`}</section>`;
const link = (route, text, className = '') => html`<a class="${className}" href="#/${route}">${text}</a>`;
const empty = (text, route = 'library', action = 'Browse workouts') =>
    html`<div class="empty-state"><p>${text}</p>${link(route, action, 'button secondary')}</div>`;
const stat = (label, value, unit = '') => html`<div class="stat"><span>${label}</span><strong>${value}<small>${unit}</small></strong></div>`;
/**
 * Launches the main training platform shell and hosts the navigation routing logic.
 *
 * This is the app-level UI entry point: it creates the side navigation, bootstraps the
 * current route, and then lets other modules render the dashboard, calendar, plan, and
 * settings views into the same shell.
 *
 * @param {Element} root - Root DOM element that will receive the platform markup.
 * @returns {Promise<void>} Resolves after the platform shell and route plumbing are ready.
 */
export async function launchPlatform(root) {
    root.removeAttribute('role');
    let mobile = window.innerWidth <= 700;
    document.body.classList.add('platform-app');
    document.body.classList.toggle('mobile-app', mobile);
    /**
     * Build either desktop page links or mobile tabs plus the More menu; resizing replaces only
     * this navigation, not the ride engine.
     */
    const navigation = () => mobile
        ? html`${mobileTabs.map(([route, label]) =>
            html`<a class="tab" data-tab="${route}" href="#/${route}">${icons[route]}<span>${label}</span></a>`)}
            <button type="button" class="tab" data-tab="more" aria-expanded="false" aria-controls="more-menu">${icons.more}<span>More</span></button>
            <div class="more-menu" id="more-menu" hidden><div class="more-menu-panel">
                <p class="eyebrow" id="more-menu-title">More</p>
                <ul aria-labelledby="more-menu-title">${moreRoutes.map(route =>
                    html`<li><a href="#/${route}">${icons[route]}<span>${routes[route][0]}</span></a></li>`)}</ul>
            </div></div>`
        : Object.keys(routes).filter(r => r !== 'workout').map(route => link(route, routes[route][0]));
    setHTML(root, html`<a class="skip-link" href="#main-content">Skip to content</a>
        <aside class="sidebar"><a class="brand" href="${mobile ? '/mobile' : '/'}" aria-label="Too Many Watts home">Too Many Watts</a>
            <nav aria-label="Main navigation">${navigation()}</nav>
            <div class="sidebar-bottom"><span>Train with intention.</span></div>
            ${mobile ? '' : versionMarkup({showRevision: false})}
        </aside>
        <main id="main-content" tabindex="-1"><header class="platform-header">
            <div class="platform-heading"><span class="mobile-brand-mark" aria-hidden="true"></span>
                <div><p class="eyebrow" id="route-subtitle"></p><h1 id="route-title" tabindex="-1"></h1></div></div>
        </header><div id="platform-message" role="status" aria-live="polite"></div>
        <div id="platform-content"><p role="status">Loading your training...</p></div>
        <div id="legacy-slot"></div></main>`);
    if(!mobile) mountVersions(root);
    const legacy = document.querySelector('.wrapper');
    root.querySelector('#legacy-slot').append(legacy);
    const deviceSettings = legacy.querySelector('#view--settings-settings');
    if(deviceSettings) {
        const secondaryDevices = [...deviceSettings.querySelectorAll(':scope > .device-card')].slice(1);
        const options = deviceSettings.querySelector(':scope > .list--sub-section');
        const about = deviceSettings.querySelector(':scope > div > .page--heading')?.parentElement;
        for(const [index, section] of [...secondaryDevices, options, about].filter(Boolean).entries()) {
            const title = section.querySelector('.device-card--header--label, h2')?.textContent.trim();
            if(!title) continue;
            insertHTML(section, 'beforebegin', mobileDetails(`device-options-${index}`, title, ''));
            const disclosure = section.previousElementSibling;
            disclosure.open = !mobile;
            disclosure.querySelector('.mobile-details-body').append(section);
        }
    }
    const content = root.querySelector('#platform-content');
    const message = root.querySelector('#platform-message');
    let db;
    let engineModels;
    const targetPower = (value, ftp) => engineModels.ftp.toAbsolute(value, ftp);
    let route = 'dashboard';
    // Detail screens (workout, editor) keep the tab the rider came from highlighted.
    let activeTab = 'dashboard';
    /** Highlight the current page and preserve the originating mobile tab for detail screens. */
    const markNavigation = () => {
        if(moreRoutes.includes(route)) activeTab = 'more';
        else if(mobileTabs.some(([tab]) => tab === route)) activeTab = route;
        root.querySelectorAll('nav a').forEach(a => a.setAttribute('aria-current',
            a.getAttribute('href') === `#/${route}` ? 'page' : 'false'));
        root.querySelectorAll('nav [data-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === activeTab));
    };
    /**
     * Open/close the mobile menu, keep its accessibility state in sync and move keyboard focus to
     * the menu or back to its button when requested.
     */
    const setMoreMenu = (open, returnFocus = false) => {
        const menu = root.querySelector('#more-menu');
        const button = root.querySelector('[data-tab="more"]');
        if(!menu || !button || menu.hidden !== open) return;
        menu.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
        if(open) menu.querySelector('a').focus();
        else if(returnFocus) button.focus();
    };
    let selectedId = '';
    let integration;
    let integrationLoading = false;
    let integrationSync = null;
    const activityDataCache = new Map();
    let busy = false;
    let ready = false;
    const mobileSections = new Map();
    /**
     * Restore each compact section's remembered open state on mobile, always expanding desktop
     * content and sections containing an error.
     */
    const updateMobileSections = () => {
        root.querySelectorAll('[data-mobile-details]').forEach(section => {
            section.open = !mobile || Boolean(section.querySelector('[role="alert"]')) ||
                (mobileSections.get(section.dataset.mobileDetails) ?? openOnMobile.has(section.dataset.mobileDetails));
        });
    };
    root.addEventListener('toggle', event => {
        if(ready && mobile && event.target.matches('[data-mobile-details]')) {
            mobileSections.set(event.target.dataset.mobileDetails, event.target.open);
        }
    }, true);
    window.addEventListener('resize', () => {
        const nextMobile = window.innerWidth <= 700;
        if(nextMobile === mobile) return;
        mobile = nextMobile;
        document.body.classList.toggle('mobile-app', mobile);
        setHTML(root.querySelector('.sidebar nav'), html`${navigation()}`);
        markNavigation();
        const sidebar = root.querySelector('.sidebar');
        let versions = sidebar.querySelector('.app-versions');
        if(!mobile && !versions) {
            insertHTML(sidebar, 'beforeend', versionMarkup({showRevision: false}));
            versions = sidebar.querySelector('.app-versions');
            mountVersions(sidebar);
        }
        if(versions) versions.hidden = mobile;
        updateMobileSections();
        if(ready && ['dashboard', 'library'].includes(route)) render();
        if(ready && route === 'calendar') legacy.querySelector('training-calendar')?.render();
    });
    let coachingError = '';
    let profileSyncError = '';
    let lastRide;
    let savingRide = false;
    let timeline;
    let state;
    let stateVersion = 0;
    const sensorStatus = {};
    const requestedDevices = new Set();
    /**
     * Show readable status or error text and use the matching accessibility role so assistive
     * technology can announce it.
     */
    const report = (text, error = false) => {
        message.textContent = text;
        message.setAttribute('role', error ? 'alert' : 'status');
        message.classList.toggle('error', error);
    };
    /**
     * Run one screen action at a time, mark the interface busy, surface failures and always release
     * the busy state.
     */
    const run = async action => {
        if(busy) return;
        busy = true;
        root.setAttribute('aria-busy', 'true');
        try { await action(); }
        catch(error) { report(error.message || 'This action could not be completed.', true); }
        finally { busy = false; root.removeAttribute('aria-busy'); }
    };
    /**
     * Review missed Coach sessions only after any history import has finished, then notify
     * interested screens of the updated data.
     */
    const refresh = async () => {
        if(coachingService().syncPending) return;
        await coachingService().advance();
        xf.dispatch('coaching:changed');
    };
    const deviceState = id => sensorStatus[id]?.startsWith('Connected') ? 'connected'
        : sensorStatus[id]?.startsWith('Connecting') ? 'connecting' : 'disconnected';
    const deviceButtons = () => html`<div class="device-buttons">${Object.entries(devices).map(([id, name]) =>
        html`<button class="secondary device-connect" data-device="${id}" data-state="${deviceState(id)}">
            <span class="device-connect--name"><i class="device-connect--dot" aria-hidden="true"></i>${name}</span>
            <span data-sensor="${id}">${sensorStatus[id] || 'Not connected'}</span>
        </button>`)}</div>`;
    const devicesView = () => html`<section class="devices-overview">
        <div><p class="eyebrow">Connection console</p>
            <h2>Connect the equipment that powers your ride.</h2>
            <p>Select a trainer or sensor. After it connects, choose which measurements it should supply in the device rows below.</p></div>
        <div class="devices-overview--status"><strong>${Object.values(sensorStatus).filter(status => status === 'Connected').length}</strong>
            <span>devices connected</span></div>
    </section>
    <section class="devices-connect-panel" aria-labelledby="devices-connect-title">
        <div><h2 id="devices-connect-title">Quick connect</h2>
            <p class="muted">Tap a device to open its browser pairing prompt.</p></div>
        ${deviceButtons()}
    </section>
    ${!navigator.bluetooth ? html`<p class="devices-browser-warning" role="alert">
        <strong>Web Bluetooth is unavailable.</strong>
        Use Chrome or Edge on a supported device and open Athlima over HTTPS or localhost. ANT+ requires Web Serial or WebUSB.
    </p>` : ''}
    <div class="devices-source-heading"><div><p class="eyebrow">Measurement sources</p>
        <h2>Choose the data you trust.</h2></div>
        <p class="muted">Select one source per metric. A connected device can stay paired without supplying every reading.</p></div>`;
    const workoutRow = workout => html`<li class="session-row"><div><span class="eyebrow">${workout.date} / ${workout.family}</span>
        <strong>${workout.title}</strong><span>${minutes(workout.duration)} · ${workout.status}</span></div>
        ${link(`workout/${encodeURIComponent(workout.id)}`, 'View session', 'button secondary')}</li>`;
    /**
     * Choose the latest available plan-change or state explanation; without one, show setup
     * guidance rather than inventing a recommendation.
     */
    const recommendation = data => data?.plan?.adaptations?.at(-1)?.reasoning ||
        state?.readiness?.reason || data?.plan?.rationale ||
        'Set your availability and a dated goal to build a plan around your life.';
    const remainingGoalDays = (goal, day) => {
        if(!goal?.date) return null;
        const remaining = Math.ceil((Date.parse(`${goal.date}T12:00:00Z`) -
            Date.parse(`${day}T12:00:00Z`)) / 86400000);
        return remaining > 0 ? remaining : 0;
    };
    const quickGoalName = type => visibleText(DAILY_GOAL_LABELS[type] || type.replaceAll('_', ' '));
    const visibleText = visibleCoachText;
    const quickSportCards = selectedSport => html`
        <button type="button" class="daily-choice ${selectedSport === 'cycling' ? 'selected' : ''}" data-daily-sport="cycling" aria-pressed="${selectedSport === 'cycling'}">
            <span class="daily-choice-icon" aria-hidden="true">${icon('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16h5.5L9.5 9h6L18 16M9.5 9l-.4-1.5M7.6 7.5h3"/><path d="M11.5 16l4-7"/>')}</span>
            <strong>Cycling</strong>
            <small>Bike workouts</small>
        </button>
        <button type="button" class="daily-choice ${selectedSport === 'running' ? 'selected' : ''}" data-daily-sport="running" aria-pressed="${selectedSport === 'running'}">
            <span class="daily-choice-icon" aria-hidden="true">${icon('<circle cx="12" cy="4" r="2"/><path d="M10 7l-2 5 4 2 2 7M8 12l-4 2M14 14l4 2"/>')}</span>
            <strong>Running</strong>
            <small>Run and pace</small>
        </button>`;
    const quickGoalCards = (types, selectedType) => types.map(type => html`
        <button type="button" class="daily-choice daily-goal-choice ${type === selectedType ? 'selected' : ''}" data-daily-type="${type}" aria-pressed="${type === selectedType}">
            <span class="daily-choice-icon" aria-hidden="true">${icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4V2M20 12h2"/>')}</span>
            <strong>${quickGoalName(type)}</strong>
        </button>`);
    const quickTimelineCards = (selectedDate, horizon) => html`
        ${DAILY_HORIZONS.map(option => html`
            <button type="button" class="daily-choice daily-timeline-choice ${!selectedDate && horizon === option.days ? 'selected' : ''}" data-daily-timeline="${option.days}" aria-pressed="${!selectedDate && horizon === option.days}">
                <span class="daily-choice-icon" aria-hidden="true">${icon('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>')}</span>
                <strong>${option.label}</strong>
            </button>`)}
        <button type="button" class="daily-choice daily-timeline-choice ${selectedDate ? 'selected' : ''}" data-daily-timeline="date" aria-pressed="${selectedDate}">
            <span class="daily-choice-icon" aria-hidden="true">${icon('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M12 12v5M9.5 14.5h5"/>')}</span>
            <strong>Choose a date</strong>
        </button>`;
    const quickGoalEditorView = data => {
        const profile = data?.profile || null;
        const sport = profile?.sport || 'cycling';
        const goal = data?.goal || null;
        const selectedSport = dailyGoalEditor?.sport || sport;
        const types = quickGoalTypes(selectedSport);
        const selectedType = dailyGoalEditor?.type || goal?.type ||
            (selectedSport === 'running' ? 'general_running' : 'general_fitness');
        const selectedDate = dailyGoalEditor?.date !== undefined
            ? dailyGoalEditor.date
            : (goal?.date || '');
        const horizon = Number(dailyGoalEditor?.horizon || 91);
        const missing = missingQuickProfileFields(profile);
        return html`<section class="daily-goal-editor panel" aria-labelledby="daily-goal-editor-title">
            <p class="eyebrow">Your goal</p>
            <h2 id="daily-goal-editor-title" tabindex="-1">${goal ? 'Edit your goal' : 'Set your goal'}</h2>
            <form id="daily-goal-form" novalidate>
                <fieldset>
                    <legend>1. Choose your sport</legend>
                    <div class="daily-choice-grid daily-sport-grid">${quickSportCards(selectedSport)}</div>
                </fieldset>
                <fieldset>
                    <legend>2. Choose your goal</legend>
                    <div class="daily-choice-grid daily-goal-grid">${quickGoalCards(types, selectedType)}</div>
                </fieldset>
                <fieldset>
                    <legend>3. Choose a timeline</legend>
                    <div class="daily-choice-grid daily-timeline-grid">${quickTimelineCards(selectedDate, horizon)}</div>
                    <label class="daily-date-field" ${selectedDate ? '' : 'hidden'}>Goal date<input type="date" name="dailyDate" value="${selectedDate}" min="${addDays(today(data), 1)}" max="${addDays(today(data), 365)}"></label>
                </fieldset>
                <input type="hidden" name="dailySport" value="${selectedSport}">
                <input type="hidden" name="dailyGoal" value="${selectedType}">
                <input type="hidden" name="dailyTimeline" value="${selectedDate ? 'date' : horizon}">
                ${missing.length ? html`<p class="coach-alert" role="alert"><strong>Before a plan can be created:</strong> ${missing.map(value => escape(value)).join(', ')}.
                    ${link('coach', 'Open Coach settings', 'button secondary')}</p>` : ''}
                <p class="muted" data-daily-date-preview></p>
                <p class="coach-alert" role="alert" data-daily-goal-error hidden></p>
                <div class="button-row">
                    <button type="button" data-action="daily-preview">Preview goal change</button>
                    <button type="button" class="secondary" data-action="daily-cancel">Cancel</button>
                </div>
            </form>
        </section>`;
    };
    const dailyGoalCard = data => {
        if(!data?.goal) return html`<button type="button" class="daily-goal-card overview-goal-card panel" data-action="daily-edit" data-today-goal-card aria-label="Set a training goal">
            <span class="daily-choice-icon" aria-hidden="true">${icon('<path d="M4 20V5"/><path d="M4 6h12l-3 4 3 4H4"/>')}</span>
            <span class="overview-goal-copy">
                <span class="eyebrow">Your direction</span>
                <strong>Give your training a target.</strong>
                <small>Set a cycling or running goal and turn the next weeks into a clear plan.</small>
            </span>
            <span class="overview-goal-action">Set a goal <span aria-hidden="true">→</span></span>
        </button>`;
        const goal = data.goal;
        const day = today(data);
        const remaining = remainingGoalDays(goal, day);
        return html`<button type="button" class="daily-goal-card overview-goal-card panel" data-action="daily-edit" data-today-goal-card aria-label="Edit your goal">
            <span class="daily-choice-icon" aria-hidden="true">${icon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4V2M20 12h2"/>')}</span>
            <span class="overview-goal-copy">
                <span class="eyebrow">${data.profile?.sport === 'running' ? 'Running goal' : 'Cycling goal'}</span>
                <strong>${visibleText(goal.name || quickGoalName(goal.type))}</strong>
                <small>${goal.date ? `${new Date(`${goal.date}T12:00:00Z`).toLocaleDateString(undefined, {day: 'numeric', month: 'long', year: 'numeric'})} · ${remaining} days remaining` : 'No goal date yet'}</small>
            </span>
            <span class="overview-goal-action">Edit goal <span aria-hidden="true">→</span></span>
        </button>`;
    };

    /**
     * Combine today's Coach, manual-calendar and imported sessions with recent cycling totals. A
     * missing Coach shows a recovery message while local riding remains available.
     */
    const todayCard = (label, title, reason, actions, snapshot = '') => html`<section class="panel overview-today hero">
        <p class="eyebrow">${label}</p>
        <h2 class="hero-title">${title}</h2>
        <p class="overview-today-copy">${reason}</p>
        ${snapshot}
        <div class="button-row overview-today-actions">${actions}</div>
    </section>`;
    const dailyPrimaryView = (data, daily) => {
        const unconfiguredActions = html`<button type="button" data-action="train-now">Train now</button>
            ${link('library', 'Browse workouts', 'button secondary')}`;
        if(!daily) return todayCard('Ready when you are', 'Make today count.',
            'Start a focused ride now, or explore a workout that fits the time and energy you have.', unconfiguredActions);
        const snapshot = daily.snapshotDate
            ? html`<p class="muted">Evidence snapshot: ${daily.snapshotDate}</p>` : '';
        const title = visibleText(daily.title);
        const reason = visibleText(daily.reason);
        if(daily.status === 'planned' && daily.session) {
            const run = (daily.session.sport ?? 'cycling') === 'running';
            return todayCard(`Today · ${escape(daily.session.family)} · ${minutes(daily.session.duration)}`, escape(title), escape(reason),
                run ? link(`workout/${encodeURIComponent(daily.session.id)}`, 'View run', 'button')
                    : html`<button type="button" data-action="start-workout" data-workout-id="${escape(daily.session.id)}">Start training</button>
                        ${link(`workout/${encodeURIComponent(daily.session.id)}`, 'View training', 'button secondary')}`, snapshot);
        }
        if(daily.status === 'review') {
            return todayCard('Review before training', escape(title), escape(reason),
                link('coach', 'Review Coach proposal', 'button'), snapshot);
        }
        if(daily.status === 'paused') {
            return todayCard('Training paused', escape(title), escape(reason),
                link('coach', 'Open Coach safety status', 'button secondary'), snapshot);
        }
        if(daily.status === 'rest') {
            return todayCard('Recovery today', escape(title), escape(reason),
                html`${link('library', 'Choose an easy session', 'button')}${link('coach', 'Open full Coach', 'button secondary')}`, snapshot);
        }
        if(!data?.goal && !data?.plan) return todayCard('Ready when you are', 'Make today count.',
            'Start a focused ride in one click, or give Coach a goal and let it build the path ahead.', unconfiguredActions);
        return todayCard(daily.status === 'unknown' ? 'Evidence needed' : 'Your training', escape(title), escape(reason),
            html`${link('library', 'Choose a workout', 'button')}${link('coach', 'Open Coach', 'button secondary')}`, snapshot);
    };
    function dashboard(data) {
        if(!data) return card('Training data unavailable', html`<p>${coachingError || 'Your local training data has not loaded.'}</p>
            <button data-action="reload">Reload training data</button><p class="muted">Your local workout library and ride controls remain available.</p>`);
        const summary = trainingSummary(data);
        const daily = todayRecommendation({data, state, now: new Date().toISOString()});
        const calendar = legacy.querySelector('training-calendar');
        const next = [...summary.upcoming.filter(w => w.date > today(data))];
        if(calendar) {
            for(let offset = 1; offset <= 14; offset++) {
                for(const entry of calendar.entriesForDate(addDays(today(data), offset))) {
                    if(entry.source === 'coaching' || !entry.workout) continue;
                    next.push({id: entry.workout.id, date: entry.date, title: entry.name, family: entry.source,
                        status: 'scheduled', duration: entry.workout.meta.duration || 0});
                }
            }
            next.sort((a, b) => a.date.localeCompare(b.date));
        }
        const goalPanel = dailyGoalEditor ? quickGoalEditorView(data) : dailyGoalCard(data);
        const goalPreview = dailyGoalPreview ? html`<section class="panel overview-goal-preview" tabindex="-1" data-daily-goal-preview><h2>Goal change preview</h2><p><strong>Current:</strong> ${escape(visibleText(data.goal?.name || 'No goal'))}</p>
            <p><strong>New:</strong> ${escape(visibleText(dailyGoalPreview.goal.name))}</p>
            <p>Difference: ${Math.round(dailyGoalPreview.forecast.afterMinutes - dailyGoalPreview.forecast.beforeMinutes)} planned minutes · ${Math.round((dailyGoalPreview.forecast.afterLoad - dailyGoalPreview.forecast.beforeLoad) * 10) / 10} load points.</p>
            ${dailyGoalPreview.warnings.length ? html`<div role="alert" class="daily-preview-warnings">${[...new Set(dailyGoalPreview.warnings.map(visibleText))].slice(0, 3).map(warning => html`<p>${escape(warning)}</p>`)}</div>` : ''}
            <div class="button-row"><button data-action="daily-accept">Accept new goal</button><button class="secondary" data-action="daily-cancel">Cancel</button></div></section>` : '';
        const weekly = html`<section class="panel overview-week">
            <div class="overview-week-heading"><div><p class="eyebrow">Your momentum</p><h2>This week</h2></div>${link('progress', 'Full progress', 'overview-text-link')}</div>
            <div class="stats">${stat('Ride time', number(summary.seconds / 3600, 1), 'h')}${stat('Rides', summary.week.length)}
                ${stat('Plan complete', summary.adherence == null ? '--' : `${Math.round(summary.adherence * 100)}%`)}</div>
            <p class="muted">${summary.due ? `${summary.completed} of ${summary.due} scheduled sessions completed or substituted.` : 'Start with one session. Consistency builds from there.'}</p>
            ${weekChart(summary)}
        </section>`;
        const nextCard = card('Coming next', next.length ? html`<ul class="session-list">${next.slice(0, 3).map(workoutRow)}</ul>${link('calendar', 'Open calendar', 'overview-text-link')}` :
            html`<p class="overview-empty-title">Your next sessions will appear here.</p><p class="muted">Build a plan around your schedule, then let the calendar keep the next move visible.</p>${link('coach', 'Build my plan', 'button secondary')}`, 'overview-next', true);
        const coachCard = card('Coach guidance', html`<p class="coach-note">${recommendation(data)}</p><p class="muted">Conservative training guidance. Not medical advice.</p>${link('coach', 'Open Coach', 'overview-text-link')}`, 'overview-coach', true);
        if(mobile) return html`<div class="overview-page">
            ${dailyGoalEditor ? html`<div class="overview-editor">${goalPanel}</div>` : ''}
            ${dailyPrimaryView(data, daily)}
            ${dailyGoalEditor ? '' : goalPanel}
            ${goalPreview}
            ${db.elapsed > 0 ? card('Ride recovery', html`<p>A ${time(db.elapsed)} ride is saved on this device. Reconnect your trainer before resuming.</p>${link('player', 'Return to ride', 'button')}`, 'overview-recovery') : ''}
            ${weekly}
            ${nextCard}
            ${coachCard}
        </div>`;
        return html`<div class="overview-page">
            ${dailyGoalEditor ? html`<div class="overview-editor">${goalPanel}</div>` : ''}
            <div class="overview-lead ${dailyGoalEditor ? 'overview-lead-single' : ''}">
                ${dailyPrimaryView(data, daily)}
                ${dailyGoalEditor ? '' : html`<div class="overview-side">${goalPanel}</div>`}
            </div>
            ${goalPreview}
            ${db.elapsed > 0 ? card('Ride recovery', html`<p>A ${time(db.elapsed)} ride is saved on this device. Reconnect your trainer before resuming.</p>${link('player', 'Return to ride', 'button')}`, 'overview-recovery') : ''}
            ${weekly}
            <div class="overview-bottom">${nextCard}${coachCard}</div>
        </div>`;
    }
    /**
     * Draw recent daily cycling minutes, scaling against at least one hour so tiny totals do not
     * appear disproportionately large.
     */
    function weekChart(summary) {
        const maximum = Math.max(3600, ...summary.days.map(day => day.seconds));
        return html`<div class="week-chart" role="img" aria-label="Ride duration in minutes for the last seven days">${summary.days.map(day =>
            html`<div><span>${Math.round(day.seconds / 60)}</span><i style="height:${Math.max(2, day.seconds / maximum * 100)}px"></i>
                <small>${new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, {weekday: 'short'})}</small></div>`)}</div>`;
    }
    /**
     * Resolve a detail-screen ID against the active plan, local library or cached provider
     * workouts, converting a Coach session to the player format.
     */
    function selectedWorkout(data) {
        const planned = data?.plan?.workouts.find(workout => workout.id === selectedId);
        const external = legacy.querySelector('training-calendar')?.plannedWorkouts.find(workout => workout.id === selectedId);
        return planned ? toAppWorkout(planned) : db.workouts.find(workout => workout.id === selectedId) || external;
    }
    /**
     * Explain why a planned session cannot currently start, rather than returning a bare yes/no.
     * The engine performs its own final start checks too.
     */
    function startBlocker(data, planned) {
        if(!planned) return '';
        if(data.plan.trainingPaused || data.safetyStatus) {
            return 'Training is paused while pain or illness is reported. Update your symptom status in Coach before starting planned sessions.';
        }
        if(data.profile?.adultAthleteConfirmed !== true) {
            return 'Confirm that the athlete is 18 or older by reconfiguring the plan in Coach before starting it.';
        }
        if(data.plan.status !== 'active' || planned.date !== today(data) || planned.status !== 'scheduled') {
            return 'Coach sessions can be ridden on their scheduled date while unresolved.';
        }
        return '';
    }
    /**
     * Describe the selected workout with targets and notes. Running shows pace/effort guidance
     * rather than a trainer Start action.
     */
    function details(data) {
        const workout = selectedWorkout(data);
        if(!workout) return empty('This workout is not available on this device.');
        const planned = data?.plan?.workouts.find(w => w.id === selectedId);
        const run = planned?.sport === 'running';
        const blocked = run ? '' : startBlocker(data, planned);
        const canStart = !run && !blocked;
        const paces = run ? describeRunPaces(planned.steps, data.profile?.thresholdPace, data.profile?.unitSystem) : '';
        const target = step => run ? paces ? formatPace(paceForIntensity(data.profile.thresholdPace, step.power), data.profile.unitSystem)
            : `${number(step.power * 100)}% of threshold speed`
            : step.power == null ? `Slope ${number(step.slope, 1)}%` : `${number(targetPower(step.power, db.ftp))} W`;
        return card(workout.meta.name, html`<p class="eyebrow">${workout.meta.category} / ${minutes(workout.meta.duration || 0)}</p>
            ${profileGraph(workout)}
            ${planned ? html`<p>${planned.date} · ${planned.status} · Expected RPE ${planned.expectedRpe}/10</p>` : ''}
            ${run ? html`<p>${paces ? `Pace guide: ${paces}.` : 'Set a threshold pace in Coach to see pace targets; run by effort (RPE) until then.'}</p>` : ''}
            <div class="button-row">${canStart ? html`<button data-action="start-workout">Start workout</button>` : run
                ? html`<p class="muted">Run this session outdoors or on a treadmill, or export the ZWO from the calendar to your watch. Recorded runs are matched automatically.</p>`
                : html`<p class="muted">${blocked}</p>`}${run ? '' : link('devices', 'Connect devices', 'button secondary')}</div>
            ${mobileDetails('workout-notes', 'Workout notes', html`<p class="description">${workout.meta.description || 'No description supplied.'}</p>`)}
            ${mobileDetails('workout-intervals', 'Intervals', html`<ol class="interval-list">${(workout.intervals || []).flatMap(interval => interval.steps || []).map(step => html`<li>
                ${time(step.duration)} · ${target(step)}${run ? '' : ` · Cadence: ${cadenceSummary([step])}`}</li>`)}</ol>`)}`);
    }
    function plan(data) {
        return renderPlan(data, today(data));
    }
    /**
     * Show normalized history alongside pending/device-only FIT recordings without duplicating the
     * same ride. File actions reflect which local/provider data is available.
     */
    function activities(data) {
        const lists = activityLists(data, db.activity, false);
        const timeZone = data?.profile?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        return html`${lastRide ? card('Ride saved', html`<div class="stats">${stat('Duration', time(lastRide.duration))}
            ${stat('Average power', number(lastRide.averagePower), 'W')}${stat('Average HR', number(lastRide.averageHeartRate), 'bpm')}</div>
            <p>Saved on this device. No account or upload is required.
            Add session feedback in Coach to inform your next session.</p>${link('coach', 'Add feedback', 'button secondary')}`) : ''}
            ${renderActivityOverview(data, lists, state)}
            ${lists.pending.length ? card('Awaiting local coaching update', html`<p>Your recordings are safely stored on this device.</p>
                <ul class="session-list">${lists.pending.map(activity => localActivityRow(activity, timeZone))}</ul><button data-action="retry-rides">Retry synchronization</button>`) : ''}
            ${lists.cached.length ? card('Device recordings', html`<p>Earlier recordings are still available on this device.</p>
                <ul class="session-list">${lists.cached.map(activity => localActivityRow(activity, timeZone))}</ul>`) : ''}
            ${card('Activity history', !lists.historyAvailable ? html`<p role="status">Activity history is currently unavailable.</p>` :
                lists.history.length ? html`<div class="table-scroll"><table><thead><tr><th>Activity</th><th>Duration</th><th>Distance</th>
                <th>Avg power</th><th>Avg HR</th><th>Load / feedback</th><th>Source</th><th>File</th></tr></thead><tbody>${lists.history.map(activity =>
                historyActivityRow(activity, lists.localById.get(String(activity.id)), integration?.connected))}</tbody></table></div>` :
                empty('Your activities will appear here after you finish a workout or connect Intervals.icu.', 'settings', 'Connect an integration'), 'activity-history')}
            <p class="muted">Missing measurements are shown as --, not estimated. FIT downloads are retained locally for the most recent seven rides.</p>`;
    }
    /**
     * Show cycling-duration trends and available Coach estimates with their units and uncertainty,
     * not a fabricated fitness score for missing history.
     */
    function progress(data) {
        const summary = trainingSummary(data);
        return html`${card('Last seven days', html`<div class="stats">${stat('Ride time', number(summary.seconds / 3600, 1), 'h')}
            ${stat('Cycling activities', summary.week.length)}${stat('Plan completion to date', summary.adherence == null ? '--' : `${Math.round(summary.adherence * 100)}%`)}</div>
            ${weekChart(summary)}<p class="muted">Duration includes cycling activities in your normalized history. Plan completion is completed/substituted sessions divided by all sessions scheduled through today.</p>`)}
            ${state ? html`<div class="dashboard-grid">${card('Training load', html`<p class="eyebrow">Scale: ${state.loadSource} / confidence: ${state.loadConfidence}</p>
                <div class="stats">${stat('Weekly load', number(state.weeklyLoad, 1))}${stat('Chronic load', number(state.chronicLoad, 1))}
                ${stat('Acute load', number(state.acuteLoad, 1))}</div><p class="muted">${state.loadExplanation}</p>`)}
                ${card('Power profile', html`<p class="muted">Best observed efforts, not necessarily maximal. Missing efforts are not evidence of decline.</p>
                <div class="table-scroll"><table><thead><tr><th>Duration</th><th>Watts</th><th>W/kg</th></tr></thead><tbody>
                ${state.powerDuration.map(effort => html`<tr><td>${time(effort.seconds)}</td><td>${number(effort.watts)}</td><td>${number(effort.wKg, 2)}</td></tr>`)}</tbody></table></div>`, '', true)}</div>` :
                card('Training metrics', html`<p>Configure your Coach profile to calculate training-load and power metrics from your history. No inferred fitness score is shown without sufficient data.</p>`)}`;
    }
    /**
     * Build the ride screen once with target/actual readings, the timed profile and save-recovery
     * controls. updateRide fills and refreshes those placeholders.
     */
    function player() {
        timeline = rideTimeline(db.workout, db.ftp, targetPower);
        return html`<section class="ride-panel"><div class="ride-heading"><div><p class="eyebrow">Workout player</p><h2>${db.workout?.meta?.name || 'Free ride'}${db.workout?.trainNow ? html` <span class="plan-chip">Train Now</span>` : ''}</h2></div>
            <span id="ride-status" role="status"></span></div>
            ${db.workout?.trainNow ? html`<details class="ride-train-now" open><summary>Why this workout?</summary><p>${db.workout.trainNow.reasoning}</p></details>` : ''}
            <div class="ride-metrics">
                <div class="ride-metric primary"><span class="ride-metric-label">Live power</span>
                    <div class="ride-live-value"><strong id="ride-power">--</strong><small>W</small></div>
                    <div class="ride-target-row"><span>Target</span><b id="ride-target">--</b><small>W</small></div>
                    <span id="ride-power-state" class="ride-power-state">Waiting for power</span></div>
                <div class="ride-metric countdown"><span class="ride-metric-label">Interval left</span>
                    <strong id="ride-countdown">--</strong><span id="ride-interval"></span></div>
                <div class="ride-metric"><span id="ride-cadence-label">Cadence</span><div id="ride-cadence-prescription" hidden><strong id="ride-cadence-target"></strong><small id="ride-cadence-unit">rpm</small></div>
                    <span class="ride-reading">Actual <b id="ride-cadence">--</b> rpm</span></div>
            </div>
            <div class="ride-summary"><span><small>Heart rate</small><strong id="ride-hr">--</strong><b>bpm</b></span>
                <span><small>Elapsed</small><strong id="ride-elapsed">--</strong></span>
                <span><small>Workout left</small><strong id="ride-remaining">--</strong></span>
                <span><small>Intensity</small><strong id="ride-target-zone">--</strong></span></div>
            <section class="ride-workout-profile" aria-labelledby="ride-profile-heading">
                <div class="ride-profile-heading"><div><h3 id="ride-profile-heading">Workout power profile</h3>
                    <span class="ride-profile-zone-summary">FTP-relative intensity zones</span></div><span id="ride-position-label"></span></div>
                <div id="ride-profile" class="ride-profile" role="img" aria-label="Workout target power profile">${rideProfile(timeline)}</div>
                <progress id="ride-progress" max="1" value="0" aria-label="Workout progress" ${timeline ? '' : 'hidden'}></progress>
                <div class="interval-context"><div class="ride-zone-legend" aria-label="Power zone legend">
                    <span><i class="zone-one"></i>Easy</span><span><i class="zone-four"></i>Threshold</span>
                    <span><i class="zone-five"></i>Hard</span><span><i class="zone-seven"></i>Peak</span></div><strong id="ride-next"></strong></div>
            </section>
            <p id="ride-instruction" class="ride-instruction" hidden></p>
            <div class="ride-actions"><button data-action="ride-toggle" id="ride-toggle">Start workout</button>
                <button class="secondary" data-action="ride-skip">Skip interval</button>
                <button class="secondary" data-action="ride-finish">Finish & save</button></div>
            <p>${link('library', 'Choose a workout')}</p>
            <section id="ride-unsaved" role="alert" hidden><h3>Recording needs saving</h3>
                <p>Keep this page open. Download your FIT file now, or retry local storage after freeing space.</p>
                <div class="button-row"><button data-action="recover-download">Download unsaved FIT</button>
                <button class="secondary" data-action="recover-save">Retry saving</button></div></section>
            <details class="ride-settings"><summary>Devices &amp; trainer settings</summary><div class="ride-sensors">${deviceButtons()}</div>
            <div class="ride-adjust"><label>Trainer mode<select id="ride-mode"><option value="erg">ERG</option>
                <option value="resistance">Resistance</option><option value="sim">Slope</option></select></label>
                <button class="secondary" data-action="target-down" aria-label="Decrease current target">-</button>
                <span id="ride-adjust-value"></span><button class="secondary" data-action="target-up" aria-label="Increase current target">+</button></div></details>
            <p class="muted" id="ride-recovery">${db.elapsed ? 'Ride recovered on this device. Reconnect sensors before resuming.' : 'Connect a trainer and sensors, then start. Your ride is recovered locally after an interruption.'}</p>
        </section>`;
    }
    /**
     * Build local profile, integration and backup controls. Provider-managed FTP/body mass are
     * read-only while connected.
     */
    function settings() {
        const locked = integration?.connected;
        return html`<div class="dashboard-grid">${card('Rider profile', html`<p>Settings, workouts, recordings, calendar and coaching are stored only on this device.</p>
            <form id="profile-form"><label>FTP (W)<input name="ftp" type="number" min="1" max="1500" value="${db.ftp}" required ${locked ? 'disabled' : ''}></label>
                <label>Body mass (kg)<input name="weight" type="number" min="1" max="500" step="0.1" value="${db.weight}" required ${locked ? 'disabled' : ''}></label>
                <button ${locked ? 'disabled' : ''}>Save profile</button></form>${locked ? html`<p class="muted">FTP and body mass are managed by Intervals.icu and refreshed each time this app opens. Change them in Intervals.icu, or disconnect to edit locally.</p><button class="secondary" data-action="import-profile">Refresh Intervals.icu profile</button>` : ''}
                <p class="muted">After changing FTP, archive and regenerate an active plan before riding it.</p>`)}
            ${card('Intervals.icu', integrationView(), '', true)}
            ${card('Local backup', html`<p>Download your coaching history, plans, workout files, recent FIT recordings, settings and calendar. Keep a backup before clearing browser data or changing devices.</p>
                <div class="button-row"><button class="secondary" data-action="backup">Download backup</button>
                <label>Restore backup<input id="restore-backup" type="file" accept=".json,application/json"></label></div>
                <p class="muted">Restore merges workout/recording files and replaces local coaching, settings and calendar. Integration API keys are not included.</p>
                <button class="secondary" data-action="export">Export local training history</button>`, '', true)}
            ${card('This device', html`<p id="storage-status">Checking local storage...</p>
                <p class="muted">The browser may remove local data to free space. Download a backup before clearing site data or changing devices.</p>`)}
            ${card('Delete local data', html`<p>Erase workouts, rides, coaching history, settings, calendar, offline files and any saved Intervals.icu key from this browser. This cannot be undone.</p>
                <button class="secondary" data-action="delete-all">Delete all local data</button>`)}</div>`;
    }
    /**
     * Present connection setup or import progress without displaying the saved API key. Imported
     * history is separate from the connection credentials.
     */
    function integrationView() {
        if(!integration) return html`<p role="status">Loading integration status...</p>`;
        if(!integration.connected) return html`<p>Import history directly from Intervals.icu into your local Activities, analytics and Coach. Your personal API key is stored in this browser and sent only to Intervals.icu. Anyone with access to this browser profile can use it.</p>
            <form id="intervals-connect"><label>Personal API key<input name="apiKey" type="password" required autocomplete="off" maxlength="1024"></label>
                <label>Import from<input name="oldest" type="date" value="${addDays(today(), -365)}" max="${today()}" required></label>
                <label class="check"><input type="checkbox" name="remember" checked> Keep this connection on this device</label>
                <button>Test & connect</button></form><p class="muted">Personal/self-hosted connections only. Strava-origin data is not available through the Intervals.icu API.</p>`;
        const athleteIdText = integration.athleteId && integration.athleteId !== '0'
            ? `Athlete ID: ${integration.athleteId}`
            : 'Athlete ID: auto-resolved from your Intervals.icu account';
        return html`<p class="eyebrow">${integration.status}</p><p>Last successful sync: ${integration.lastSuccess ? new Date(integration.lastSuccess).toLocaleString() : 'Not yet synced'}</p>
            ${integration.nextDate ? html`<p>Importing ${integration.nextDate} through ${integration.through} in 31-day batches.</p>` : ''}
            ${integration.error ? html`<p role="alert">${integration.error}</p>` : ''}
            ${integration.skipped?.length ? html`<details class="muted"><summary>${integration.skipped.length} activit${integration.skipped.length === 1 ? 'y' : 'ies'} skipped (missing ID, start time or duration)</summary><ul>${integration.skipped.map(label => html`<li>${label}</li>`)}</ul></details>` : ''}
            ${integration.retryAt && integration.status === 'queued' ? html`<p>Retry after ${new Date(integration.retryAt).toLocaleString()}</p>` : ''}
            <p class="muted">${athleteIdText}</p>
            <div class="button-row"><button data-action="sync" ${['running', 'queued'].includes(integration.status) ? 'disabled' : ''}>${integration.lastSuccess ? 'Sync now' : 'Import history'}</button>
                <button class="secondary" data-action="test-connection">Test connection</button>
                <button class="secondary" data-action="disconnect">Disconnect</button></div>
            <p class="muted">Your API key is stored in this browser, not on an Too Many Watts server. Disconnect removes it; imported history is retained. Sync runs while this app is open and rechecks the last seven days for updates.${integration.remembered === false ? ' This connection is kept only until you close this tab.' : ''}</p>`;
    }
    /**
     * Refresh connection status without overlapping another status load or overwriting a focused
     * connection form.
     */
    async function loadIntegration() {
        if(integrationLoading) return;
        integrationLoading = true;
        try {
            integration = intervals.status();
            xf.dispatch('services', {intervals: integration.connected});
            if(route === 'settings' && !root.querySelector('#intervals-connect:focus-within')) render();
            if(integration.error || integration.status === 'error') {
                report(integration.error || 'Intervals.icu sync failed. Retry in Settings > Integrations.', true);
            }
        } catch(error) {
            report(error.message, true);
        }
        finally { integrationLoading = false; }
    }
    /**
     * Coordinate provider profile/history refresh and local Coach review. Clear temporary
     * detailed-data caches after success and restore visible integration status even on failure.
     */
    async function syncIntegration({profileSynced = false} = {}) {
        if(integrationSync) return integrationSync;
        integrationSync = (async () => {
            integration = {...intervals.status(), status: 'running'};
            if(route === 'settings') render();
            try {
                if(!profileSynced) {
                    await intervals.syncProfile();
                    profileSyncError = '';
                    if(route === 'settings') render();
                }
                await intervals.sync(coachingService(), current => {
                    integration = current;
                    if(route === 'settings') render();
                    xf.dispatch('coaching:changed');
                });
                coachingService().syncPending = false;
                activityDataCache.clear();
                await refresh();
            } finally {
                integration = intervals.status();
                render();
            }
            report('Intervals.icu sync completed. Local Coach and training plan are up to date.');
        })();
        try {
            return await integrationSync;
        } finally {
            integrationSync = null;
        }
    }
    /**
     * Report persistence and space use in Settings. Failure to read an estimate is not an error the
     * rider needs to act on, so the text stays factual and the controls remain available.
     */
    async function refreshStorageStatus() {
        const element = root.querySelector('#storage-status');
        if(!element) return;
        const status = await storageStatus();
        const size = bytes => Number.isFinite(bytes)
            ? `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB` : 'unknown';
        const usage = status.usage == null ? 'Training data is stored on this device.'
            : `Using about ${size(status.usage)}${status.quota ? ` of ${size(status.quota)} available` : ''}.`;
        element.textContent = `${usage} ${status.persisted
            ? 'The browser has agreed to keep this data unless you clear it.'
            : 'The browser may remove this data when space is low; keep a downloaded backup.'}`;
    }

    let libraryFilters = initialLibraryFilters();
    let libraryPage = 0;
    let dailyGoalEditor = false;
    let dailyGoalPreview = null;
    /**
     * Draw the selected platform page or expose the existing calendar/Coach/device/editor elements.
     * Do nothing before engine startup and profile handling finish.
     */
    function render() {
        if(!ready) return;
        const data = coachingData();
        const [title, subtitle] = routes[route] || ['Workout editor', 'Build a session'];
        root.querySelector('#route-title').textContent = mobile && route === 'dashboard' ? 'Ready to ride?' : title;
        root.querySelector('#route-subtitle').textContent = subtitle;
        markNavigation();
        document.body.dataset.route = route;
        legacy.hidden = !['calendar', 'coach', 'devices', 'editor'].includes(route);
        setHTML(content, route === 'dashboard' ? dashboard(data) : route === 'library' ? renderLibrary(db.workouts, libraryFilters,
            {page: libraryPage, pageSize: mobile ? 6 : Infinity})
            : route === 'workout' ? details(data) : route === 'plan' ? plan(data)
                : route === 'activities' ? activities(data) : route === 'progress' ? progress(data)
                    : route === 'player' ? player() : route === 'settings' ? settings()
                        : route === 'devices' ? devicesView()
                            : route === 'coach' ? html`<p class="muted">Your on-device Coach plans around your goal, schedule and ride history.</p>` : html``);
        updateMobileSections();
        if(route === 'settings') void refreshStorageStatus();
        if(route === 'player') updateRide();
    }
    /**
     * Read the address fragment, safely decode a workout ID, close menus and render the
     * destination. Move focus to its heading and request only the page-specific data needed.
     */
    function navigate() {
        setMoreMenu(false);
        const destination = parsePlatformRoute(window.location.hash);
        route = destination.route;
        selectedId = destination.selectedId;
        report(profileSyncError || coachingError, Boolean(profileSyncError || coachingError));
        render();
        if(route === 'settings') void loadIntegration();
        if(route === 'calendar') void legacy.querySelector('training-calendar').loadPlannedMonth();
        root.querySelector('#route-title').focus?.();
    }
    /**
     * Refresh live values and profile position without replacing controls. Distinguish prescribed
     * targets from readings, hide absent cadence prescriptions and show unavailable values for
     * disconnected sensors.
     */
    function updateRide() {
        if(!ready || route !== 'player') return;
        const intervals = db.workout?.intervals || [];
        const current = intervals[db.intervalIndex];
        const step = current?.steps?.[db.stepIndex];
        const next = intervals[db.intervalIndex + 1];
        const nextStep = next?.steps?.[0];
        const duration = timeline?.duration;
        const position = ridePosition(timeline, db);
        const remaining = duration - position;
        const running = db.workoutStatus === 'started';
        const finished = db.workoutStatus === 'done';
        const cadence = finished ? null : running && db.cadenceTarget > 0 ? db.cadenceTarget : step?.cadence;
        const cadenceTarget = Number.isFinite(cadence) && cadence > 0 ? cadence : null;
        const connected = metric => !db.connectedDevices || db.connectedDevices[db.sources?.[metric]] === true;
        const livePower = connected('power') && Number.isFinite(db.power1s) ? db.power1s : null;
        const target = finished || step?.power == null ? null
            : running ? db.powerTarget : targetPower(step.power, db.ftp);
        const targetWatts = Number.isFinite(target) && target > 0 ? target : null;
        const targetZone = ridePowerZone(targetWatts, db.ftp);
        const delta = livePower != null && targetWatts != null ? Math.round(livePower - targetWatts) : null;
        const tolerance = targetWatts == null ? 0 : Math.max(5, targetWatts * 0.03);
        const powerState = delta == null ? 'Waiting for power' : Math.abs(delta) <= tolerance
            ? 'On target' : delta < 0 ? `${Math.abs(delta)} W low` : `${delta} W high`;
        const values = {
            power: livePower == null ? '--' : number(livePower),
            target: targetWatts == null ? '--' : number(targetWatts),
            'power-state': powerState,
            countdown: time(finished ? 0 : running || !timeline ? db.lapTime : timeline.intervals[db.intervalIndex]?.duration),
            cadence: connected('cadence') ? number(db.cadence) : '--',
            'cadence-label': cadenceTarget == null ? 'Cadence' : 'Cadence target',
            'cadence-target': cadenceTarget == null ? '' : number(cadenceTarget),
            'cadence-unit': cadenceTarget == null ? '' : 'rpm',
            hr: connected('heartRate') && db.heartRate > 0 ? number(db.heartRate) : '--', elapsed: time(db.elapsed),
            interval: intervals.length ? `Interval ${Math.min(intervals.length, db.intervalIndex + 1)} / ${intervals.length}` : 'Free ride',
            next: !finished && nextStep ? `Next: ${time(next.duration)} / ${nextStep.power == null ? 'No power target' : `${number(targetPower(nextStep.power, db.ftp))} W`}${nextStep.cadence > 0 ? ` / ${number(nextStep.cadence)} rpm` : ''}` : 'No next interval',
            remaining: duration ? time(remaining) : '--',
            'target-zone': targetZone?.name.replace(' · ', ' ') || '--',
            'position-label': duration ? `${time(position)} / ${time(duration)}` : 'Free ride',
            status: db.workoutStatus === 'done' ? 'Workout complete - finish to save' : db.watchStatus,
            toggle: db.watchStatus === 'started' ? 'Pause' : db.elapsed > 0 ? 'Resume' : 'Start workout',
            'adjust-value': db.mode === 'erg' ? `${number(db.powerTarget)} W` : db.mode === 'resistance'
                ? `${number(db.resistanceTarget)}% resistance` : `${number(db.slopeTarget, 1)}% slope`,
        };
        Object.entries(values).forEach(([key, value]) => {
            const element = root.querySelector(`#ride-${key}`);
            if(element) element.textContent = value;
        });
        const powerMetric = root.querySelector('.ride-metric.primary');
        powerMetric.dataset.targetState = delta == null ? 'waiting' : Math.abs(delta) <= tolerance
            ? 'on-target' : delta < 0 ? 'low' : 'high';
        const progress = root.querySelector('#ride-progress');
        if(progress) progress.value = duration ? position / duration : 0;
        root.querySelector('#ride-cadence-prescription').hidden = cadenceTarget == null;
        const instruction = root.querySelector('#ride-instruction');
        instruction.textContent = db.workoutTextEvent || '';
        instruction.hidden = !instruction.textContent;
        if(timeline) {
            const fraction = position / duration;
            root.querySelector('#ride-profile-cursor').style.left = `${fraction * 100}%`;
            root.querySelector('#ride-profile-cursor span').textContent = finished ? 'Done' : 'Now';
            root.querySelector('#ride-profile-completed').setAttribute('width', fraction * 1000);
            const interval = timeline.intervals[db.intervalIndex];
            const active = root.querySelector('#ride-profile-active');
            active.setAttribute('x', interval ? interval.start / duration * 1000 : 0);
            active.setAttribute('width', interval && !finished ? interval.duration / duration * 1000 : 0);
            root.querySelector('#ride-profile').setAttribute('aria-label',
                `Workout target power profile. Position ${time(position)} of ${time(duration)}.`);
        }
        const mode = root.querySelector('#ride-mode');
        if(mode && document.activeElement !== mode) mode.value = db.mode;
        root.querySelector('[data-action="ride-skip"]').disabled = db.watchStatus !== 'started' || !intervals.length;
        root.querySelector('[data-action="ride-finish"]').disabled = !db.elapsed;
        root.querySelector('[data-action="ride-toggle"]').disabled = savingRide || Boolean(engineModels.activity?.pendingRecording);
        root.querySelector('#ride-unsaved').hidden = !engineModels.activity?.pendingRecording;
    }

    root.addEventListener('input', event => {
        if(event.target.id !== 'workout-search') return;
        libraryFilters.search = event.target.value;
        libraryPage = 0;
        const position = event.target.selectionStart;
        render();
        const input = root.querySelector('#workout-search');
        input.focus();
        input.setSelectionRange(position, position);
    });
    /**
     * Use one parent listener for replaceable page controls. Backup restoration requires a stopped
     * ride and confirmation; workout imports are saved before they are added to the displayed
     * library.
     */
    root.addEventListener('change', event => {
        if(event.target.name === 'dailySport') {
            const sport = event.target.value;
            const types = quickGoalTypes(sport);
            dailyGoalEditor = {sport, type: types[0], date: ''};
            dailyGoalPreview = null;
            render();
            root.querySelector('[name=dailySport]')?.focus();
            return;
        }
        if(event.target.name === 'dailyTimeline') {
            const dateInput = root.querySelector('[name=dailyDate]');
            const label = dateInput?.closest('label');
            if(label) label.hidden = event.target.value !== 'date';
            if(event.target.value !== 'date' && dateInput) dateInput.value = '';
            if(event.target.value === 'date') dateInput?.focus();
            return;
        }
        const libraryField = {
            'workout-category': 'category', 'workout-type': 'type',
            'workout-duration': 'duration', 'workout-sort': 'sort',
        }[event.target.id];
        if(libraryField) {
            libraryFilters[libraryField] = event.target.value;
            libraryPage = 0;
            render();
            root.querySelector(`#${event.target.id}`).focus();
            return;
        }
        if(event.target.id === 'ride-mode') xf.dispatch('ui:mode-set', event.target.value);
        if(event.target.id === 'restore-backup') {
            const file = event.target.files[0];
            if(!file) return;
            void run(async () => {
                if(db.watchStatus !== 'stopped') throw new Error('Finish your current ride before restoring data.');
                if(file.size > 25 * 1024 * 1024) throw new Error('This backup is too large to restore. Choose a file under 25 MB.');
                if(!confirm('Merge backup files and replace local coaching, settings and calendar?')) return;
                const {restoreBackup} = await import('../storage/backup.js');
                await restoreBackup(JSON.parse(await file.text()));
                window.location.reload();
            });
        }
        if(event.target.id === 'platform-upload') {
            const files = Array.from(event.target.files);
            if(!files.length) return;
            void run(async () => {
                const { models } = await import('../models/models.js');
                for(const file of files) {
                    const {result, name} = await models.workout.readFromFile(file);
                    const workout = models.workout.parse(result, name);
                    await models.workouts.save(workout);
                    db.workouts.push(workout);
                    xf.dispatch('db:workouts', db);
                }
                render();
                report('Workout files imported.');
            });
        }
    });
    root.addEventListener('submit', event => {
        if(!['profile-form', 'intervals-connect'].includes(event.target.id)) return;
        event.preventDefault();
        const form = event.target;
        const values = new FormData(form);
        void run(async () => {
            if(form.id === 'profile-form') {
                if(intervals.status().connected) throw new Error('FTP and body mass are managed by Intervals.icu. Change them there, or disconnect first.');
                xf.dispatch('ui:ftp-set', Number(values.get('ftp')));
                xf.dispatch('ui:weight-set', Number(values.get('weight')));
                report('Device profile saved.');
            } else {
                const apiKey = values.get('apiKey');
                const remember = values.get('remember') !== null;
                form.reset();
                integration = await intervals.connect({apiKey, oldest: values.get('oldest'), remember});
                render();
                await intervals.syncProfile();
                profileSyncError = '';
                render();
                report('Intervals.icu connected. Choose Import history to begin.');
            }
        });
    });
    /**
     * Route clicks from child icons/labels to their owning control with closest(). File deletion,
     * downloads, device connections and ride actions each keep their own confirmation or error
     * path.
     */
    root.addEventListener('click', event => {
        if(event.target.closest('.skip-link')) {
            event.preventDefault();
            root.querySelector('#main-content').focus();
            return;
        }
        const moreButton = event.target.closest('[data-tab="more"]');
        if(moreButton) {
            setMoreMenu(moreButton.getAttribute('aria-expanded') !== 'true');
            return;
        }
        const moreMenu = root.querySelector('#more-menu');
        if(moreMenu && !moreMenu.hidden) {
            if(event.target === moreMenu) {
                setMoreMenu(false, true);
                return;
            }
            const destination = event.target.closest('#more-menu a');
            if(destination) {
                setMoreMenu(false);
                if(destination.getAttribute('href') === `#/${route}`) root.querySelector('#route-title').focus();
                return;
            }
            if(!event.target.closest('#more-menu')) setMoreMenu(false);
        }
        if(event.target.closest('[data-library-reset]')) {
            libraryFilters = initialLibraryFilters();
            libraryPage = 0;
            render();
            root.querySelector('#workout-search').focus();
            return;
        }
        const pageButton = event.target.closest('[data-library-page]');
        if(pageButton) {
            libraryPage = Number(pageButton.dataset.libraryPage);
            render();
            const results = root.querySelector('#library-results');
            results.setAttribute('tabindex', '-1');
            results.focus();
            results.scrollIntoView({block: 'start'});
            return;
        }
        const device = event.target.closest('[data-device]')?.dataset.device;
        if(device) { requestedDevices.add(device); xf.dispatch(`ui:ble:${device}:switch`); return; }
        const download = event.target.closest('[data-download]')?.dataset.download;
        if(download) {
            void run(async () => { const {models} = await import('../models/models.js'); await models.activity.download(download); });
            return;
        }
        const deleteRide = event.target.closest('[data-delete-ride]')?.dataset.deleteRide;
        if(deleteRide) {
            void run(async () => {
                if(!confirm('Delete this Too Many Watts activity and its local FIT recording? Existing plan decisions and external uploads are not removed.')) return;
                const service = coachingService();
                const activity = service.data?.activities?.find(item => String(item.id) === deleteRide);
                if(activity && activity.source !== 'too-many-watts') throw new Error('Only Too Many Watts recordings can be deleted here.');
                if(db.activity.some(item => String(item.id) === deleteRide)) {
                    const {idb} = await import('../storage/idb.js');
                    await idb.removeChecked('activity', deleteRide);
                    db.activity = db.activity.filter(item => String(item.id) !== deleteRide);
                }
                if(activity) {
                    try {
                        await service.deleteRide(activity.id);
                    } catch(error) {
                        render();
                        throw new Error(`Activity history could not be deleted; retry. Any local FIT recording has already been removed: ${error.message}`);
                    }
                }
                if(lastRide && String(lastRide.id) === deleteRide) lastRide = null;
                xf.dispatch('coaching:changed');
                render();
                report('Activity deleted. External uploads and previous plan decisions were not changed.');
            });
            return;
        }
        const upload = event.target.closest('[data-upload-ride]')?.dataset.uploadRide;
        if(upload) {
            void run(async () => {
                const {models} = await import('../models/models.js');
                const {idb} = await import('../storage/idb.js');
                const record = await idb.getChecked('activity', upload);
                const result = await models.api.intervals.uploadWorkout(record);
                if(result !== ':success') throw new Error('Intervals.icu upload failed. Check the connection and retry.');
                report('Recording sent to Intervals.icu. Run Sync to refresh provider metadata.');
            });
            return;
        }
        const activityButton = event.target.closest('[data-load-activity]');
        if(activityButton) {
            const activityId = activityButton.dataset.loadActivity;
            const panel = activityButton.closest('tr')?.querySelector('.activity-stream-panel');
            if(!panel || !activityId) return;
            if(!panel.hidden) {
                panel.hidden = true;
                activityButton.setAttribute('aria-expanded', 'false');
                return;
            }
            void run(async () => {
                activityButton.disabled = true;
                activityButton.textContent = 'Loading...';
                try {
                    const data = activityDataCache.get(activityId) ??
                        await intervals.activityData(activityId);
                    activityDataCache.set(activityId, data);
                    if(!panel.isConnected) return;
                    setHTML(panel, renderActivityStreamData(data));
                    panel.hidden = false;
                    activityButton.setAttribute('aria-expanded', 'true');
                } finally {
                    activityButton.disabled = false;
                    activityButton.textContent = 'Route & data';
                }
            });
            return;
        }
        if(event.target.closest('[data-download-activity-csv]')) {
            const row = event.target.closest('tr');
            const activityId = row?.querySelector('[data-load-activity]')?.dataset.loadActivity;
            const streams = activityDataCache.get(activityId)?.streams;
            if(!streams) return;
            const names = ['time', 'watts', 'heartrate', 'cadence'];
            const count = Math.max(0, ...names.map(name => streams[name]?.length || 0));
            const csv = ['sample_index,time_seconds,watts,heartrate_bpm,cadence_rpm',
                ...Array.from({length: count}, (_, index) =>
                    [index, ...names.map(name => streams[name]?.[index] ?? '')].join(','))].join('\n');
            const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `activity-${activityId}-streams.csv`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return;
        }
        const dailySport = event.target.closest('[data-daily-sport]')?.dataset.dailySport;
        if(dailySport) {
            const data = coachingData();
            const goal = data?.goal;
            dailyGoalEditor = {
                sport: dailySport,
                type: dailySport === 'running' ? 'general_running' : 'general_fitness',
                date: goal?.date || '',
                horizon: 91,
            };
            dailyGoalPreview = null;
            render();
            root.querySelector(`[data-daily-sport="${dailySport}"]`)?.focus();
            return;
        }
        const dailyType = event.target.closest('[data-daily-type]')?.dataset.dailyType;
        if(dailyType) {
            const data = coachingData();
            const sport = dailyGoalEditor?.sport || data?.profile?.sport || 'cycling';
            dailyGoalEditor = {
                sport,
                type: dailyType,
                date: dailyGoalEditor?.date || data?.goal?.date || '',
                horizon: dailyGoalEditor?.horizon || 91,
            };
            dailyGoalPreview = null;
            render();
            root.querySelector(`[data-daily-type="${dailyType}"]`)?.focus();
            return;
        }
        const dailyTimeline = event.target.closest('[data-daily-timeline]')?.dataset.dailyTimeline;
        if(dailyTimeline) {
            const data = coachingData();
            const sport = dailyGoalEditor?.sport || data?.profile?.sport || 'cycling';
            const isDate = dailyTimeline === 'date';
            dailyGoalEditor = {
                sport,
                type: dailyGoalEditor?.type || (sport === 'running' ? 'general_running' : 'general_fitness'),
                date: isDate ? (dailyGoalEditor?.date || data?.goal?.date || '') : '',
                horizon: isDate ? 91 : Number(dailyTimeline),
            };
            dailyGoalPreview = null;
            render();
            if(isDate) root.querySelector('[name=dailyDate]')?.focus();
            else root.querySelector(`[data-daily-timeline="${dailyTimeline}"]`)?.focus();
            return;
        }
        const action = event.target.closest('[data-action]')?.dataset.action;
        if(!action) return;
        if(action === 'daily-edit') {
            const data = coachingData();
            dailyGoalEditor = {sport: data?.profile?.sport || data?.goal?.type && sportForGoalType(data.goal.type) || 'cycling',
                type: data?.goal?.type || 'general_fitness', date: data?.goal?.date || '', horizon: 91};
            dailyGoalPreview = null;
            render();
            root.querySelector('#daily-goal-editor-title')?.focus();
            return;
        }
        if(action === 'daily-sport') {
            return;
        }
        if(action === 'daily-cancel') {
            dailyGoalEditor = false;
            dailyGoalPreview = null;
            render();
            root.querySelector('[data-action=daily-edit]')?.focus();
            return;
        }
        if(action === 'daily-preview') {
            void run(async () => {
                const form = root.querySelector('#daily-goal-form');
                if(!form) throw new Error('The goal form is no longer available.');
                const values = new FormData(form);
                const sport = values.get('dailySport');
                const type = values.get('dailyGoal');
                const timeline = values.get('dailyTimeline');
                const requestedDate = timeline === 'date' ? values.get('dailyDate') : '';
                const goal = normalizeQuickGoal({
                    sport, type, horizon: timeline === 'date' ? null : timeline,
                    date: requestedDate, today: today(coachingData()),
                });
                const data = coachingData();
                let profile = quickProfile(data?.profile, sport);
                if(!profile) {
                    const missing = missingQuickProfileFields(null);
                    throw new Error(`Complete the full Coach first: ${missing.join(', ')}.`);
                }
                if(profile.adultAthleteConfirmed !== true) {
                    throw new Error('Confirm athlete age in the full Coach before creating or changing a plan.');
                }
                const missing = missingQuickProfileFields(profile);
                if(missing.length) throw new Error(`Complete the full Coach first: ${missing.join(', ')}.`);
                const mergedGoal = data?.goal
                    ? {...JSON.parse(JSON.stringify(data.goal)), ...goal,
                        date: goal.date, type: goal.type, name: goal.name, active: true}
                    : goal;
                dailyGoalPreview = coachingService().previewQuickGoal({profile, goal: mergedGoal});
                render();
                root.querySelector('[data-daily-goal-preview]')?.focus();
            });
            return;
        }
        if(action === 'daily-accept') {
            void run(async () => {
                if(!dailyGoalPreview) throw new Error('Preview the goal change before accepting it.');
                await coachingService().acceptQuickGoal(dailyGoalPreview);
                dailyGoalEditor = false;
                dailyGoalPreview = null;
                xf.dispatch('coaching:changed');
                render();
                root.querySelector('[data-today-goal-card]')?.focus();
                report('The goal change was accepted and the plan was revised.');
            });
            return;
        }
        if(action === 'sync') {
            void syncIntegration().catch(error => report(error.message, true));
            return;
        }
        void run(async () => {
            if(engineModels.activity?.pendingRecording && !['recover-download', 'recover-save'].includes(action)) {
                throw new Error('Save or download the unsaved FIT recording before continuing.');
            }
            if(action === 'train-now') {
                if(db.watchStatus !== 'stopped' || db.elapsed > 0) {
                    throw new Error('Finish and save your current ride before starting another workout.');
                }
                if(intervals.status().connected) {
                    report('Syncing the latest Intervals.icu profile and activity history before Train Now...');
                    try {
                        await syncIntegration();
                    } catch(error) {
                        const continueWithKnown = confirm(`${error.message}\n\nContinue Train Now using the last known Coach data?`);
                        if(!continueWithKnown) {
                            report('Train Now cancelled because Intervals.icu could not be refreshed.', true);
                            return;
                        }
                        report('Using the last known Coach data because Intervals.icu could not be refreshed.');
                    }
                }
                const data = coachingData();
                const {trainNowWorkout} = await import('../coaching/train-now.js');
                const result = trainNowWorkout({data, asOf: today(data)});
                if(data.profile.ftp !== db.ftp) {
                    throw new Error('Update device FTP to match your Coach profile before using Train Now.');
                }
                const workout = toAppWorkout(result.workout);
                // An ad-hoc session is not a planned session: record it as unplanned.
                workout.coachingWorkoutId = null;
                workout.trainNow = result.workout.trainNow;
                xf.dispatch('workout', workout);
                window.location.hash = '/player';
                xf.dispatch('ui:watchStart');
                xf.dispatch('ui:workoutStart');
                return;
            }
            if(action === 'start-workout') {
                if(db.watchStatus !== 'stopped' || db.elapsed > 0 || savingRide) {
                    throw new Error('Finish and save your current ride before starting another workout.');
                }
                const data = coachingData();
                const workoutId = event.target.closest('[data-workout-id]')?.dataset.workoutId;
                if(workoutId) selectedId = workoutId;
                const workout = selectedWorkout(data);
                if(!workout) throw new Error('This workout is not available on this device.');
                if(workout.coachingWorkoutId) {
                    const planned = data?.plan?.workouts.find(w => w.id === workout.coachingWorkoutId);
                    const blocked = !planned ? 'This coach session is no longer in your plan. Open the calendar to pick a current session.'
                        : planned.sport === 'running'
                            ? 'Runs are not played on the trainer. Follow the pace guide in the calendar or export the ZWO to your watch.'
                            : startBlocker(data, planned);
                    if(blocked) throw new Error(blocked);
                    if(data.profile.ftp !== db.ftp) throw new Error('Update device FTP to match your Coach profile, or regenerate your plan.');
                    const previous = db.workout;
                    xf.dispatch('ui:coaching:select', workout);
                    // The engine reports its own rejection through coaching:error; never start the previous workout instead.
                    if(db.workout === previous || db.workout?.coachingWorkoutId !== workout.coachingWorkoutId) return;
                } else xf.dispatch('workout', workout);
                window.location.hash = '/player';
                xf.dispatch('ui:watchStart');
                xf.dispatch('ui:workoutStart');
            } else if(action === 'ride-toggle') {
                if(db.watchStatus === 'started') xf.dispatch('ui:watchPause');
                else if(db.elapsed > 0) xf.dispatch('ui:watchResume');
                else { xf.dispatch('ui:watchStart'); xf.dispatch('ui:workoutStart'); }
            } else if(action === 'recover-download') {
                const record = engineModels.activity.pendingRecording;
                const {fileHandler} = await import('../file.js');
                fileHandler.download()(record.blob, engineModels.activity.fileName(record.summary.timestamp),
                    'application/octet-stream');
            } else if(action === 'recover-save') xf.dispatch('ui:activity:retry-save');
            else if(action === 'ride-skip') xf.dispatch('ui:watchLap');
            else if(action === 'ride-finish') {
                if(db.watchStatus === 'started') xf.dispatch('ui:watchPause');
                xf.dispatch('ui:watchStop');
            } else if(action === 'target-up' || action === 'target-down') {
                const target = db.mode === 'erg' ? 'power' : db.mode === 'resistance' ? 'resistance' : 'slope';
                xf.dispatch(`ui:${target}-target-${action === 'target-up' ? 'inc' : 'dec'}`);
            } else if(action === 'test-connection') {
                await intervals.athlete();
                report('Intervals.icu connection is working.');
            } else if(action === 'disconnect') {
                if(!confirm('Disconnect Intervals.icu? Imported activities will be kept.')) return;
                integration = intervals.disconnect();
                profileSyncError = '';
                coachingService().syncPending = false;
                await refresh();
                activityDataCache.clear();
                render();
            } else if(action === 'backup') {
                if(db.watchStatus !== 'stopped') throw new Error('Finish your current ride before backing up.');
                const {createBackup} = await import('../storage/backup.js');
                const {fileHandler} = await import('../file.js');
                fileHandler.download()(JSON.stringify(await createBackup(db.workouts), null, 2),
                    'too-many-watts-backup.json', 'application/json');
                report('Local backup downloaded. Keep this file private.');
            } else if(action === 'export') {
                const {fileHandler} = await import('../file.js');
                fileHandler.download()(JSON.stringify(coachingData(), null, 2), 'too-many-watts-training-history.json', 'application/json');
            } else if(action === 'import-profile') {
                await intervals.syncProfile();
                profileSyncError = '';
                render();
                report('FTP and body mass synced from Intervals.icu. Regenerate an active plan if FTP changed.');
            } else if(action === 'delete-all') {
                if(db.watchStatus !== 'stopped') throw new Error('Finish your current ride before deleting local data.');
                const confirmation = window.prompt('This erases all Too Many Watts data on this device, including any saved Intervals.icu key. Type DELETE to continue.');
                if(confirmation !== 'DELETE') return;
                const {eraseLocalData} = await import('../storage/erase.js');
                await eraseLocalData();
                window.location.replace('/');
                return;
            } else if(action === 'reload') window.location.reload();
            else if(action === 'retry-rides') {
                const {syncRecordedRides} = await import('../storage/ride-sync.js');
                const sync = await syncRecordedRides(coachingService());
                if(sync.planReviewRequired) await refresh();
                db.activity = await engineModels.activity.restore();
                render();
                report('Local coaching history updated.');
            }
        });
    });
    window.addEventListener('hashchange', navigate);
    document.addEventListener('keydown', event => {
        if(event.key === 'Escape' && root.querySelector('#more-menu:not([hidden])')) setMoreMenu(false, true);
    });
    root.addEventListener('focusin', event => {
        if(!event.target.closest('#more-menu, [data-tab="more"]')) setMoreMenu(false);
    });
    window.addEventListener('pwa:error', event => report(event.detail, true));
    navigator.serviceWorker?.addEventListener('message', event => {
        if(event.data?.type === 'CACHE_ERROR') report('Some app assets could not be cached for offline use. Your active ride is unaffected.', true);
    });
    Object.keys(devices).forEach(id => {
        for(const [event, label] of [['connected', 'Connected'], ['connecting', 'Connecting...'], ['disconnected', 'Disconnected']]) {
            xf.sub(`ble:${id}:${event}`, () => {
                sensorStatus[id] = label;
                if(label === 'Connected' && requestedDevices.has(id)) {
                    const source = `ble:${id}`;
                    const selection = id === 'controllable' ? {control: source, power: source, cadence: source, speed: source}
                        : id === 'powerMeter' ? {power: source}
                            : id === 'speedCadenceSensor' ? {cadence: source, speed: source} : {heartRate: source};
                    xf.dispatch('sources', selection);
                }
                if(label !== 'Connecting...') requestedDevices.delete(id);
                queueMicrotask(updateRide);
                root.querySelectorAll(`[data-device="${id}"]`).forEach(element => {
                    element.dataset.state = deviceState(id);
                });
                root.querySelectorAll(`[data-sensor="${id}"]`).forEach(element => { element.textContent = label; });
                if(route === 'devices') {
                    const count = root.querySelector('.devices-overview--status strong');
                    if(count) count.textContent = Object.values(sensorStatus)
                        .filter(status => status === 'Connected').length;
                }
                if(label === 'Disconnected' && db?.watchStatus === 'started') {
                    report(`${devices[id]} disconnected. Reconnect the device; workout recording is still active.`, true);
                }
            });
        }
    });
    xf.sub('db:page', page => {
        if(!ready) return;
        if(page === 'home' && route !== 'player') window.location.hash = '/player';
    });
    xf.sub('coaching:error', error => { coachingError = error; report(error, true); });
    /**
     * Discard older asynchronous state-calculation results when a newer coaching update arrives,
     * and avoid rebuilding active ride/settings/Coach forms unnecessarily.
     */
    xf.sub(COACH_EVENTS.changed, () => {
        if(!ready) return;
        const data = coachingData();
        const version = ++stateVersion;
        coachingError = '';
        state = undefined;
        if(data?.profile) {
            import('../coaching/state.js').then(({estimateState}) => {
                if(version !== stateVersion) return;
                try { state = estimateState(data.activities, data.profile, today(data)); }
                catch(error) { report(`Training load could not be calculated: ${error.message}`, true); }
                if(['dashboard', 'progress', 'plan', 'activities'].includes(route)) render();
            }, error => {
                if(version === stateVersion) report(`Training load could not be calculated: ${error.message}`, true);
            });
        }
        if(!['player', 'settings', 'coach'].includes(route)) render();
    });
    xf.sub(ACTIVITY_EVENTS.saving, () => { savingRide = true; updateRide(); });
    xf.sub(ACTIVITY_EVENTS.discarded, () => {
        report('Ride discarded.');
        updateRide();
    });
    xf.sub(ACTIVITY_EVENTS.saveSuccess, ride => {
        savingRide = false;
        lastRide = ride;
        void requestPersistentStorage();
        if(route === 'player') window.location.hash = '/activities';
    });
    xf.sub(ACTIVITY_EVENTS.saveFail, () => {
        savingRide = false;
        report('Ride could not be saved. Keep this page open and download the unsaved FIT recording.', true);
        if(route !== 'player') window.location.hash = '/player';
        else updateRide();
    });
    xf.sub('action:planned', () => { if(ready && route === 'dashboard') render(); });
    xf.sub('db:workouts', () => { if(ready && route === 'library') render(); });
    for(const key of ['elapsed', 'lapTime', 'power1s', 'powerTarget', 'cadence', 'cadenceTarget', 'heartRate', 'watchStatus',
        'workoutStatus', 'intervalIndex', 'stepIndex', 'workoutTextEvent', 'mode', 'resistanceTarget', 'slopeTarget', 'sources']) xf.sub(`db:${key}`, updateRide);
    for(const key of ['workout', 'ftp']) xf.sub(`db:${key}`, () => { if(ready && route === 'player') render(); });
    /**
     * Keep both platform and legacy profile controls locked while Intervals.icu owns the values. A
     * connection-read error leaves editing locked and shows the problem.
     */
    const updateProfileLock = () => {
        let locked = true;
        try { locked = intervals.status().connected; }
        catch(error) { profileSyncError = error.message; report(error.message, true); }
        legacy.querySelectorAll('[effect="ftp-set"], [effect="weight-set"]').forEach(control => { control.disabled = locked; });
    };
    xf.sub('services', updateProfileLock);
    window.addEventListener('storage', () => {
        updateProfileLock();
        if(ready && route === 'settings') void loadIntegration();
    });
    /**
     * Attach startup listeners before importing the engine, because its module immediately starts
     * initialization. Await app:ready, then refresh provider-owned profile values before enabling
     * the platform.
     */
    const started = new Promise((resolve, reject) => {
        window.addEventListener(APP_EVENTS.ready, resolve, {once: true});
        window.addEventListener(APP_EVENTS.error, event => reject(new Error(event.detail.data)), {once: true});
    });
    await import('../index.js');
    ({db} = await import('../db.js'));
    ({models: engineModels} = await import('../models/models.js'));
    await started;
    try {
        if(intervals.status().connected) {
            setHTML(content, html`<p role="status">Syncing FTP and body mass from Intervals.icu...</p>`);
            await intervals.syncProfile();
        }
    } catch(error) {
        profileSyncError = `${error.message} Cached FTP and body mass are retained; local editing stays disabled while connected.`;
    }
    updateProfileLock();
    ready = true;
    legacy.querySelectorAll('connection-switch, protocol-switch, tab-btn, source-switch').forEach(element => {
        element.setAttribute('role', 'button');
        element.tabIndex = 0;
        element.addEventListener('keydown', event => {
            if(!['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            element.dispatchEvent(new Event('pointerup', {bubbles: true}));
        });
    });
    if(coachingData()?.profile) {
        const {estimateState} = await import('../coaching/state.js');
        state = estimateState(coachingData().activities, coachingData().profile, today(coachingData()));
    }
    navigate();
    await loadIntegration();
    if(integration?.connected && !profileSyncError) {
        report('Syncing Intervals.icu history into local coaching...');
        void syncIntegration({profileSynced: true}).catch(error => report(error.message, true));
    }
    if(profileSyncError) report(profileSyncError, true);
    if(db.elapsed > 0) {
        report('A previous ride was recovered. Reconnect your trainer and resume in Ride.');
        window.location.hash = '/player';
    }
    // Keep multi-device edits explicit; never overwrite a dirty form on focus.
    window.addEventListener('focus', () => {
        if(ready && !busy && !['coach', 'settings', 'player'].includes(route)) void run(refresh);
    });
}
