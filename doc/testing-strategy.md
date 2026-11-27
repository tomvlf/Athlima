# Testing Strategy

## Priority Matrix

| Priority | Behavior | Preferred test |
|---|---|---|
| P0 | Ride save/discard, recovery and backup integrity | Jest integration plus real-browser smoke |
| P0 | Credential exclusion and storage failure semantics | Jest storage/backup integration |
| P0 | Trusted Types/CSP and unsafe sink regressions | Jest source and build/headers tests |
| P1 | Coach planning/adaptation/matching | Jest coaching suite |
| P1 | IndexedDB, provider sync and local restore | Jest fake-IndexedDB integration |
| P1 | Desktop/mobile route and ride-state resize | Jest platform plus Playwright viewport |
| P1 | Docker routes, headers, and hidden paths | Container smoke test |
| P2 | Protocol encoders/decoders | Jest byte fixtures |
| P2 | Brand and visual consistency | Real-browser screenshots plus semantic assertions |

## Existing Coverage Worth Keeping

- 996 passing Jest tests across Coach, platform, storage, BLE/ANT, FIT, workout, model, and view behavior.
- Deliberately skipped historical tests remain explicitly labelled.
- CSP, Trusted Types, HTML sink, backup, service-worker, mobile, and version-build regressions have dedicated tests.
- A real Parcel build is covered in the Docker build and version build tests.

## Browser Gate

Playwright proves:

- The dashboard loads.
- Library and calendar routes update.
- Mobile navigation activates at 390 px.
- Desktop navigation activates at 1024 px.

It does not prove live Bluetooth, ANT+, a real trainer, real Intervals.icu access, or physiological validity.

## Quality Thresholds

- Statements: 68%
- Branches: 68%
- Functions: 65%
- Lines: 69%

Coverage is a floor, not a substitute for behavior assertions or user-journey validation.

