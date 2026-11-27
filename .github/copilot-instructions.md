# Copilot instructions for Athlima / Too Many Watts

## Project summary

- This is a browser-only indoor cycling/running training application. It has no application backend or account server.
- Training logic, Coach plans, rides, workouts, recordings and settings run and persist in the browser.
- The optional Intervals.icu integration is called directly from the browser.
- The main user-facing app is Parcel-bundled ES-module JavaScript. It uses no TypeScript or frontend framework.

## Build, run, and test

- Requirements: Node.js 22.18.0 or later and npm.
- Install exactly the locked dependencies: `npm ci --ignore-scripts --no-audit --no-fund` (the Docker build uses this form).
- Development server: `npm start`.
- HTTPS development: `npm run starttls`; it requires `dev_cert/cert.pem` and `dev_cert/key.pem`.
- Full test suite: `npm test -- --runInBand`.
- One test file: `npm test -- --runInBand test/platform/ride.test.js`.
- One test by name: `npm test -- --runInBand test/platform/ride.test.js -t "test name"`.
- A related directory/file set: `npm test -- --runInBand test/coaching test/views/training-calendar.test.js`.
- Production browser build: `npm run build` (writes `dist/`).
- There is no separate lint script in `package.json`.
- Docker production build: `docker build -t too-many-watts:local .`. The Docker build runs the suite, writes build metadata, builds Parcel, and regenerates Nginx CSP headers.
- Published/static hosting via Compose: `docker compose up -d`; stop with `docker compose down`.
- Build from the local checkout: `docker compose -f compose.yaml -f compose.server.yaml up --build -d`.
- Jest defaults to jsdom, Babel transforms ES modules, and `test/jest-setup.js` provides TextEncoder/TextDecoder and a structuredClone implementation for jsdom/fake-indexeddb. A test file can override this with `@jest-environment node`.

## Architecture and startup

The browser entry sequence is:

1. `src/index.html` loads `src/platform/start.js`.
2. `src/platform/start.js` sets the standalone storage scope, restores/redirects route state, then launches `src/platform/ui.js` and PWA registration.
3. `src/platform/ui.js` owns the current hash route, desktop/mobile shell, and modern view rendering. It imports and mounts the ride engine.
4. `src/index.js` dispatches `app:start`; its module imports register ride, device, view, workout, and timer listeners.

The major boundaries are:

- `src/platform/` - route shell, page composition, responsive navigation, ride UI, activity UI and PWA registration.
- `src/views/` - reusable custom elements and legacy screen components that remain mounted by the platform.
- `src/models/` - live measurement/settings models and provider compatibility interfaces.
- `src/coaching/` - local cycling/running plans, scheduling, adaptation, readiness, workout matching and Coach state.
- `src/storage/` - IndexedDB, local storage, backup/restore, persistence checks, ride recovery and provider sync.
- `src/ble/` and `src/ant/` - hardware discovery, protocol decoding and trainer control.
- `src/fit/` - FIT reading/writing and activity/course conversion.
- `src/workouts/` - built-in ZWO recipes and ZWO parsing.
- `src/watch.js`, `src/timer.js`, `src/activity/` - ride timing, interval progress and stop/save/discard behavior.
- `src/db.js` - live page state and event-driven model/storage coordination; it is not a server database.
- `src/functions.js` - shared functional helpers and the `xf` browser event bus.

## State and event conventions

- `xf.create(db)` wraps `db` in a Proxy. Top-level assignments to `xf`/`db` dispatch `db:<field>` events and update the live state.
- `xf.reg(eventName, handler)` receives `(payload, liveDb)`. Use it for handlers that change live state.
- `xf.sub(eventName, handler)` receives the event payload. Use it for rendering/listener-only reactions.
- Change a top-level property to trigger the normal `db:<field>` notification; changing only a nested object or array does not automatically announce a top-level change.
- `db` is live page state only. Persistence is explicit through models and storage modules. Do not infer that a successful UI update or browser write happened unless the storage call was awaited and checked.

## Storage conventions

- `store` is the main IndexedDB database. Its stores include workouts and recent FIT/activity records.
- `too-many-watts-coaching` is a separate IndexedDB database for full Coach history, profile, goal, plan and revisions.
- IndexedDB helpers in `src/storage/idb.js` have legacy fire-and-log methods and checked methods ending in `Checked`. When a save or delete must be known to have succeeded, use `putChecked`, `putManyChecked`, or `removeChecked` and await it.
- Related activity/record writes use IndexedDB transactions. Preserve `oncomplete`/`onabort` behavior instead of treating an empty array or a caught storage error as success.
- Local backup restore is not all-or-nothing across storage systems. Settings, Coach state, workouts and activity records are separate and may partially restore.
- A missing or unavailable provider/history response is different from an empty successful history. Do not silently turn load failures into `[]`.

## HTML, security and UI conventions

- Render markup with `html` tagged templates from `src/html.js`. Interpolations are escaped unless they are existing `HTMLFragment` values.
- Use `setHTML` or `insertHTML` for DOM markup sinks and `trustedScriptURL` for worker/service-worker script URLs. `parseXML` is the XML sink.
- `raw()` and direct `innerHTML`/`insertAdjacentHTML`/worker URL construction are security-sensitive exceptions. `raw()` is only for markup already safe by construction, such as charts built from numeric values.
- The CSP in `scripts/write-security-headers.mjs` forbids arbitrary inline scripts and requires Trusted Types. Rebuild and regenerate CSP headers whenever built inline scripts/import maps change. Do not relax the policy for local browser errors.
- The stylesheet order is `src/css/base.css`, `src/css/platform.css`, then `src/css/cyberpunk.css`; later rules and specificity both matter.
- `src/platform/ui.js` adds `body.mobile-app` for `innerWidth <= 700`; this state must work while resizing without remounting the ride engine.
- Mobile shared-button overrides use `.mobile-app #platform ...` selectors. The existing `#platform .button { font: inherit; }` rule is easy to override accidentally.
- Preserve locally bundled assets and the existing cyberpunk/ride-screen visual rules. UI changes involving device, rider, or training data should remain readable and distinguish unavailable readings from zero.

## Units and domain invariants

- Workout and timer durations are seconds internally.
- Coach availability/planned durations are minutes; do not pass them as timer seconds.
- Cycling `power` workout targets are fractions of FTP (for example `0.8` is 80% FTP), while absolute targets have a separate legacy interpretation.
- Running `power` steps represent threshold-speed fractions, not cycling watts. Running `thresholdPace` is seconds per kilometre.
- Activity distances use metres internally; Coach/goal distances use kilometres.
- Heart rate is bpm, cadence is rpm, and RR values are intervals in milliseconds unless a protocol module explicitly documents another unit.
- Missing sensor data must remain unavailable; it is not proof of zero power, zero cadence or zero heart rate.
- A short ride can be discarded, but a saved activity and a Coach hand-off are separate operations. The recovery checkpoint must be handled with the activity save transaction, and a Coach/provider upload failure must not rewrite the local save result.
- Built-in workout IDs are `builtin-${index}` and are derived from catalogue order. Append new built-in recipes; never reorder existing entries.

## Testing and change verification

- Prefer the nearest test file and `-t "case name"` for focused validation. The suite uses fake browser storage, not a real Bluetooth device or real Intervals.icu account.
- Tests under `test/coaching/` cover plans and adaptation; `test/platform/` covers routes/UI/storage/security; `test/ble/` and `test/ant/` cover protocol logic; `test/fit/` covers FIT encoding/decoding.
- Preserve `@jest-environment node` for Node-only tests and jsdom setup for DOM/IndexedDB tests.
- Skipped tests and explicit placeholders are not evidence of working behavior. Historical protocol and hardware tests marked `test.skip` must not be reported as passing coverage.
- Changes to Coach behavior should verify both unit decisions and relevant UI/calendar/planning surfaces. Use `doc/coaching.md` for Coach calculation and workflow conventions.
- Changes to backup, IndexedDB, PWA, CSP or local hosting should use the security/storage/build tests in `test/storage/`, `test/platform/`, and a real production build when feasible.
