---
applyTo: "**/*.{js,css,html,mjs,yml,yaml,md}"
description: Athlima repository architecture and development standards
---

# Athlima Standards

This file centralizes repository-specific conventions. Prefer it over generic framework guidance.

## Architecture

- Browser entry: `src/index.html` -> `src/platform/start.js` -> `src/platform/ui.js` -> `src/index.js`.
- `src/platform/` owns routes and page composition. `src/views/` owns reusable custom and legacy components.
- `src/db.js` is live page state, not a database. IndexedDB and local-storage persistence are explicit side effects.
- `xf.create(db)` wraps state in a Proxy; top-level assignments emit `db:<field>` events.
- `xf.reg()` receives `(payload, liveDb)` for state changes. `xf.sub()` receives an event payload for listener-only behavior.
- Major boundaries are `src/coaching/`, `src/storage/`, `src/ble/`, `src/ant/`, `src/fit/`, `src/workouts/`, `src/watch.js`, `src/timer.js`, and `src/activity/`.

## Implementation Patterns

- Use ES-module JavaScript. Do not introduce a framework or TypeScript unless the user explicitly approves a migration.
- Preserve existing event names and module responsibilities. Use `xf` rather than inventing a second app event system.
- Top-level state assignments notify screens; nested mutations do not.
- Await checked storage writes and transactions when callers must distinguish success from failure.
- Use existing helpers and unit conversion functions; do not infer units from variable names.
- Keep comments focused on boundaries, reasons, compatibility, and non-obvious invariants.
- Preserve built-in workout IDs: `builtin-${index}`. Append recipes and never reorder existing recipes.

## Units and Data

- Workout/timer durations are seconds.
- Coach availability and planned duration are minutes.
- Cycling workout power targets are FTP fractions; running power targets represent threshold-speed fractions.
- Running `thresholdPace` is seconds per kilometre.
- Activity distance is metres; Coach goal distance is kilometres.
- Missing sensor/provider values remain unavailable, never fabricated as zero.
- A planned session and a recorded activity are separate concepts. A save and Coach/provider handoff are separate operations.

## Rendering and CSS

- Build markup with `html` tagged templates from `src/html.js`. Use `setHTML`, `insertHTML`, `parseXML`, and `trustedScriptURL` for the corresponding browser sinks.
- Do not add direct `innerHTML`, `insertAdjacentHTML`, unsafe worker URLs, or plain XML parsing.
- Styles load as `base.css`, `platform.css`, then `cyberpunk.css`. Preserve existing specificity and theme behavior.
- The mobile breakpoint is `innerWidth <= 700`. Use `body.mobile-app` and `.mobile-app #platform ...` for mobile shared controls.
- Preserve the existing ride-screen contrast and distinguish unavailable readings from actual zero values.

## Storage and Recovery

- The main IndexedDB database is `store`; Coach state uses `too-many-watts-coaching`.
- Prefer checked IndexedDB helpers (`putChecked`, `putManyChecked`, `removeChecked`) for operations whose success matters.
- Preserve transaction `oncomplete`/`onabort` behavior.
- Backup restore may be partially successful across storage systems. Preserve and explain partial-restoration behavior.
- Do not assume a disconnected provider or failed history load means an empty history.

## Testing

- Jest uses jsdom by default and Babel for ES modules. Use `@jest-environment node` for Node-only tests.
- Run the nearest file first, then the related area, then `npm test -- --runInBand`.
- Use real builds for CSP, PWA, backup, Docker, and service-worker changes.
- Preserve skipped-test annotations; skipped tests are not coverage.
- Hardware/provider tests are simulations unless a real browser/device check is explicitly performed.

## Change Discipline

- Start with the action or data flow and the nearest meaningful test.
- Update directly related documentation when behavior or commands change.
- Do not commit unless explicitly requested.
- Do not publish or alter GitHub settings unless explicitly requested.

