# Security hardening plan

This plan records the security improvements identified during a review of the
current checkout (commit `44e9ce0`, detached HEAD). It is an implementation
plan, not a claim that the app is insecure: the browser-side escaping, CSP,
credential handling and container hardening are already stronger than typical.

Scope: the published static frontend, its build/release pipeline, imported
files (`.zwo`, `.fit`, backups), and the optional Intervals.icu credential.

## Implementation status

Implemented on the `security/hardening` branch:

| Item | Status |
|---|---|
| 0 — baseline (`npm ci`, build) | Done |
| 1.1 — SHA-pinned actions, Dependabot | Done |
| 1.2 — provenance/SBOM, keyless cosign signing | Done; workflow verifies the promoted digest |
| 1.3 — `npm ci --ignore-scripts` | Done and build-verified locally |
| 1.4 — `:latest` kept, digest verification documented | Done |
| 2 — COOP/CORP, HSTS `includeSubDomains`, Caddy error headers | Done |
| 3 — `html`/`setHTML` refactor, Trusted Types enforced, sink regression test | Done |
| 4 — ZWO escaping/clamps, backup caps, FIT guards, file-size cap | Done |
| 5.1 — session-only Intervals.icu key option | Done |
| 5.2 — persistence request and Settings storage summary | Done |
| 5.3 — delete all local data | Done |
| 6 — `noopener`, debug log cleanup | Done |
| 7 — full release verification | Docker and browser smoke checks implemented; real BLE/ANT+ and Caddy checks remain hardware/infrastructure evidence |

Verification performed here: `npm test` (979 passing), `npm run build` after a
`--ignore-scripts` install, and the
generated header file inspected for the new directives. Remaining checks need a
real browser and container: Trusted Types runtime behaviour across every screen,
Caddy `handle_errors`, image signing/provenance, and the full ride/import/restore
smoke test.

---

## Priority legend

| Priority | Meaning |
|---|---|
| P0 | Do before the next published image. Low effort, real exposure. |
| P1 | Do soon. Defence in depth or resilience against malicious files. |
| P2 | Optional. Larger refactor or policy decision. |

Effort is a rough estimate for one developer already familiar with the code.

## Work order

Phases are ordered so later work does not have to be redone. Each phase can ship
independently.

| Phase | Theme | Priority | Effort |
|---|---|---|---|
| 0 | Prep and baseline | P0 | 0.25 day |
| 1 | Release and supply chain | P0 | 1 day |
| 2 | Response headers and browser policy | P0–P1 | 0.5 day |
| 3 | HTML sink discipline and Trusted Types | P2 | 2–3 days |
| 4 | Untrusted input handling | P1 | 1–2 days |
| 5 | Credentials, persistence, erasure | P1 | 1 day |
| 6 | Small cleanups | P2 | 0.25 day |
| 7 | Release verification | P0 | 0.25 day |

---

## Phase 0 — Prep and baseline

The checkout is on a detached HEAD, so create a branch before editing.

```bash
git switch -c security/hardening
npm ci
npm test
npm run build
docker build -t too-many-watts:security-baseline .
```

Capture the current header set so Phase 2 can be diffed against it:

```bash
docker run --rm -p 8080:8080 too-many-watts:security-baseline &
curl -sSI http://localhost:8080/ > /tmp/headers-before.txt
```

Record the dependency audit output (`npm audit --audit-level=moderate`) and keep
it with the branch. No app logic changes in this phase.

**Done when:** tests and build pass on the branch, baseline headers and audit
output are saved.

---

## Phase 1 — Release and supply chain (P0)

This is the highest real-world risk: the workflow that publishes the image has
`packages: write`, but its actions are referenced by mutable tags.

### 1.1 Pin GitHub Actions and add Dependabot

- File: `.github/workflows/publish-image.yml`
- Replace `actions/checkout@v4`, `docker/login-action@v3`,
  `docker/metadata-action@v5` and `docker/build-push-action@v6` with full
  commit SHAs (keep the version in a trailing comment).
- Add `.github/dependabot.yml` covering `github-actions`, `docker` and `npm`
  weekly. This replaces manual digest/lockfile refresh.
- Keep `permissions` at `contents: read` / `packages: write`; do not add
  `id-token: write` unless signing is enabled in 1.2.

**Done when:** a test push runs the workflow from pinned SHAs, and Dependabot
opens at least one PR.

### 1.2 Publish provenance, SBOM and a signature

- File: `.github/workflows/publish-image.yml`
- Add `provenance: true` and `sbom: true` to `docker/build-push-action`.
- Add `docker/build-push-action` attestation output or an explicit
  `cosign sign` step using keyless (OIDC) signing. Keyless signing requires
  `id-token: write`.
- Verify locally with `docker buildx imagetools inspect
  ghcr.io/tomvlf/too-many-watts:<tag>` and `cosign verify ghcr.io/tomvlf/too-many-watts:<tag>`.

### 1.3 Stop unverified install scripts in the image build

- File: `Dockerfile`
- `package.json` contains a top-level `allowScripts` block that npm does not
  document; assume it is ignored and that dependency install scripts run.
- Try `npm ci --ignore-scripts --no-fund` and confirm `npm run build` still
  succeeds. If a dependency genuinely needs a build step, adopt
  `@lavamoat/allow-scripts` with an explicit allowlist instead of leaving the
  scripts uncontrolled.
- Keep the lockfile committed and let Dependabot update it (replaces
  `--no-audit` as the update mechanism).

### 1.4 Make deployed images traceable

- Decision point: keep `:latest` in the example Compose files for
  convenience, or pin by digest.
- Either way, add a short "verify the image" note to `README.md` (digest pin,
  `cosign verify`, SBOM location). If pinning, update `compose.yaml`,
  `compose.https.yaml` and `compose.dockhand.yaml` with `@sha256:` references
  and a comment explaining how to refresh them.
- `compose.*.yaml` keep `pull_policy: always`; that is fine for `:latest`, but
  a digest-pinned deployment should not need it.

**Done when:** image has provenance and SBOM attestations, signing is
verifiable, build no longer executes arbitrary dependency scripts, and the
README documents verification.

---

## Phase 2 — Response headers and browser policy (P0–P1)

Headers are generated at build time; tests already cover the generator, so
extend both.

- File: `scripts/write-security-headers.mjs`
  - Add `Cross-Origin-Opener-Policy: same-origin`.
  - Add `Cross-Origin-Resource-Policy: same-origin`.
  - Do **not** add COEP: it buys nothing here and risks breaking provider
    fetches/subresources.
- File: `Caddyfile`
  - HSTS: `max-age=31536000; includeSubDomains`. Add `preload` only if every
    subdomain is HTTPS-only.
  - Add a `handle_errors` block so Caddy-generated responses (bad host, 502,
    TLS errors) also carry HSTS, `X-Content-Type-Options` and
    `Referrer-Policy`.
- File: `test/platform/security-headers.test.js`
  - Assert the new headers and that `unsafe-inline`/`unsafe-eval` remain absent
    from `script-src`.
- File: `README.md`
  - Update the static-hosting note: other hosts must replicate the new headers.

What **not** to do: adding a reporting endpoint. There is no backend, and a
report-only policy without `report-to` still logs violations to the browser
console, which is enough for Phase 3.

**Done when:** headers verified with `curl -sSI` on both the container and the
Caddy variant; app smoke test passes (ride screen, device pairing, Intervals
connect, backup/restore, offline reload).

---

## Phase 3 — HTML sink discipline and Trusted Types (P2, optional)

There are ~34 `innerHTML`/`insertAdjacentHTML` sites. Escaping is currently
consistent, but it depends on reviewer discipline. This phase converts that
convention into an enforced policy.

### 3.1 Make unsafe interpolation visible

Two options, in increasing cost:

1. **Cheap:** add a Jest test that scans `src/**/*.js` for `innerHTML` /
   `insertAdjacentHTML` assignments containing `${...}` that are not wrapped in
   `escape`, `escapeHTML` or a known-safe numeric formatter. Allowlist files
   that intentionally build markup (graph renderers). This catches future
   regressions without touching runtime code.
2. **Thorough:** introduce a tagged-template helper (for example
   `html\`…\``) that escapes every interpolation by default and requires an
   explicit `raw()` opt-in. Migrate the platform renderers first
   (`src/platform/ui.js`, `activities.js`, `library.js`), then views.

### 3.2 Roll out Trusted Types in report-only mode

- File: `scripts/write-security-headers.mjs`
- Emit `Content-Security-Policy-Report-Only` with
  `require-trusted-types-for 'script'; trusted-types 'too-many-watts'` while keeping
  the enforced policy unchanged.
- Exercise every screen, import a workout, restore a backup, connect
  Intervals.icu, run a short ride. Collect console violations.
- Only after the list is empty, move the directive into the enforced policy.

### 3.3 Escape dynamic error messages

- File: `src/platform/ui.js`
- Lines interpolating `error.message` into HTML (for example `793`, `999`,
  `1058`) should use `escape` or `textContent`. This is safe today because the
  messages are internal, but it becomes a real sink the moment a provider or
  storage error carries external text.

**Done when:** Trusted Types is enforced (or the report-only policy has been
running clean for a full release), and a regression test fails if a new
unescaped interpolation is added.

---

## Phase 4 — Untrusted input handling (P1)

A shared `.zwo`, `.fit` or backup file is the main way a third party can
influence this app.

### 4.1 `.zwo` export and parse

- File: `src/workouts/zwo.js`
  - Escape text content and attribute values in `Element.write` /
    `writeAttribute` (mirror the escaping already used by `exportZwo` in
    `src/coaching/workouts.js:154`).
  - Check `doc.querySelector('parsererror')` in `read`/`readToInterval` and
    throw a clear error before touching `workout.children`.
  - Clamp/validate numeric input: `Duration`, `Repeat`, `Cadence`, power and
    slope ranges, and cap generated step counts for `Warmup`, `Cooldown` and
    `Ramp`. Reject rather than silently truncate.
- File: `src/views/editor.js`
  - Sanitize the download filename (`:740`) to strip `/`, `\`, control
    characters and leading dots.
  - Consider routing the editor download through `exportZwo`-style escaping
    rather than `zwo.write`.

### 4.2 Backup restore

- File: `src/storage/backup.js`
  - Cap accepted file size (for example 25 MB) before parsing; enforce this at
    the call site in `src/platform/ui.js:678` so `JSON.parse` never sees an
    unbounded string.
  - Cap array lengths (workouts, activities, calendar entries).
  - Require `meta` to be a plain object and numeric interval fields to be
    finite; reject instead of storing shapes the UI cannot render.
  - Wrap `atob` and `Uint8Array.from` in validation (length multiple of 4,
    valid base64) with a user-facing error.

### 4.3 FIT decoding

- File: `src/fit/fitjs.js`
  - Add a zero-progress guard in the decode loop
    (`if (!(record?.length > 0)) break;`). Current decoders appear to advance or
    throw, so this is hardening, not a known hang.
- Cap imported file size at the call site that reads `.fit` bytes.

### 4.4 Tests

- Malicious `.zwo`: name containing `</name>`, `Duration` of 10¹⁰, huge
  `Repeat`, malformed XML.
- Backup: oversized file, invalid base64, wrong `meta` shape, excessive array
  length.
- FIT: truncated file, zero-length record, file with no definition before a
  data record.
- Keep the tests in `test/workouts`, `test/server` (backup) and `test/fit`,
  mirroring the existing structure.

**Done when:** every case above is rejected with a readable message, no tab
freeze, and a round trip of a legitimate `.zwo`/backup/FIT is unchanged.

---

## Phase 5 — Credentials, persistence, erasure (P1)

### 5.1 Intervals.icu key handling

- File: `src/models/intervals.js`
- Add an explicit "remember on this device" choice:
  - remembered → current `localStorage` behaviour;
  - not remembered → keep the connection in memory (or `sessionStorage`) and
    remove it on `pagehide`.
- Migrate existing stored connections without forcing re-entry; keep the
  current cross-tab change detection and disconnect behaviour.
- Do not chase at-rest encryption. Any key readable by app code is readable by
  injected code; the honest mitigations are reducing retention and keeping the
  strict CSP.
- Update `doc/intervals-guide.md` and `test/models/intervals.test.js`.

### 5.2 Ask the browser to keep training data

- Call `navigator.storage.persist()` after the first successful save (guard for
  unsupported browsers), and surface `navigator.storage.estimate()` in
  Settings.
- This addresses the most likely data loss cause: storage eviction.

### 5.3 Add "Delete all local data"

- File: `src/platform/ui.js` (Settings) plus a small storage helper.
- Requires typed confirmation. Clears the ride database, coaching database,
  scoped settings and the service-worker caches. Must not touch the Intervals
  key unless the user also disconnects, or make that part of the same explicit
  confirmation.
- Keep it visually separate from "disconnect" and "restore", which have
  different semantics.
- Tests with `fake-indexeddb` for the deletion path and for leaving unrelated
  scoped data alone.
- Document it in `doc/backend.md` and the README data section.

**Done when:** a user can leave a shared device without health data or an API
key behind, and persistence is requested automatically.

---

## Phase 6 — Small cleanups (P2)

- `src/views/data-views.js:1978-1979`: add `rel="noopener noreferrer"` to the
  external Chrome/Edge links.
- `src/models/models.js:668`: pass `noopener` to `window.open`.
- `src/views/connection-switch.js:108,202`: remove debug `console.log` calls
  that print connection status.
- Optional: trim stale/duplicated entries in `robots.txt`; nothing security
  critical there.

---

## Phase 7 — Release verification (P0)

Before publishing:

1. `npm test` and `npm run build` pass.
2. `docker build` succeeds and `curl -sSI` shows the new headers on `/`,
   `/mobile` and a 404.
3. Smoke test: pair a trainer, run and save a short ride, export and re-import
   a `.zwo`, create and restore a backup, connect and disconnect Intervals.icu,
   reload offline.
4. Confirm the published image digest, provenance, SBOM and signature.
5. Update the Compose digest reference (if pinned) and the README verification
   note.
6. Keep the previous image tag until the new one has been used successfully.

## Definition of done for the whole plan

- Release workflow uses SHA-pinned actions, produces provenance/SBOM, and the
  image is signed and verifiable.
- Response headers include COOP, CORP, HSTS with `includeSubDomains`, and the
  trusted-types directive is either enforced or cleanly report-only.
- Malicious `.zwo`/backup/FIT inputs are rejected without freezing the tab.
- The Intervals.icu key can be kept for the session only, and all local data
  can be deleted from Settings.
- Tests cover each behavioural change, and the docs describe the new controls.

## Explicitly out of scope

- Encrypting browser storage. It does not defend against same-origin script
  execution and adds key-management complexity.
- Adding a backend, telemetry, or a CSP reporting endpoint.
- Replacing `escape`/`escapeHTML` wholesale with a framework; the current
  approach is adequate once Phase 3 makes it enforceable.
- COEP/cross-origin isolation, which would add friction without a current need.
