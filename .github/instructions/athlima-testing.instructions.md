---
applyTo: "**/{test/**/*.js,*.spec.js,*.test.js,playwright.config.js,jest.config.js}"
description: Athlima test strategy and assertion standards
---

# Athlima Testing Standards

## Test Layers

- Unit and pure behavior tests: Jest/jsdom or Node for model, Coach, protocol, parser, and utility logic.
- Integration tests: fake IndexedDB and controlled browser state for storage, UI, provider, and service interactions.
- Component and route tests: jsdom for existing platform/rendering behavior.
- End-to-end tests: Playwright only for critical real-browser journeys and responsive behavior.
- Hardware tests: separate evidence for real Bluetooth/ANT+/trainer compatibility; mocks are not device proof.

## Assertions

- Assert observable outcomes and state transitions, not implementation-only calls.
- Use fake timers and fake IndexedDB instead of real waits or a rider's browser profile.
- Explicitly test unavailable versus zero values.
- Test save failure, partial restore, retry, discard, and provider-sync consequences.
- Preserve transaction and recovery semantics.

## Running Tests

- Nearest test: `npm test -- --runInBand test/platform/ride.test.js`
- Name filter: `npm test -- --runInBand test/platform/ride.test.js -t "test name"`
- Related area: `npm test -- --runInBand test/coaching test/platform`
- Full suite: `npm test -- --runInBand`
- Coverage: `npm run test:coverage`
- Browser: `npm run test:e2e`
- Build: `npm run build`

## Quality Gates

- Coverage thresholds are global and must not fall below statements 68%, branches 68%, functions 65%, or lines 69%.
- Skipped tests are documented limitations, not passing coverage.
- Security, CSP, PWA, backup, Docker, and service-worker changes require a build or runtime smoke check.
- A browser-only unit test is not sufficient for real Bluetooth, provider, mobile viewport, or HTTPS behavior.

