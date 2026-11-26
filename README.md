
# Too Many Watts

Too Many Watts turns a compatible web browser into an indoor cycling dashboard. It can guide a workout, ask a smart trainer to change resistance, record a ride, and help plan cycling or running training.

The app's calculations run in your browser, and training data is saved in that browser. There is no Too Many Watts login or cloud account. An optional Intervals.icu connection can import activities and upload recorded rides directly to that service.

## New here? Start with this

You do not need programming knowledge to use Too Many Watts. If someone already hosts it for you, open their web address in a [supported browser](#browser-and-device-support); skip the installation and Docker sections below.

1. **Check Settings.** Review your units, body mass and cycling FTP. FTP is the power reference used to scale cycling workouts; see the short glossary below.
2. **Connect equipment.** Open **Devices** and use the connection controls. Your browser asks you to choose a trainer or sensor; a website cannot simply connect without permission.
3. **Choose a workout.** The **Library** describes what each session contains. A workout is a recipe for a ride, not a ride you have already completed.
4. **Ride.** **Start workout** opens the ride screen. **Target** values describe the requested effort; the other readings describe what connected sensors report. `--` means unavailable, not zero.
5. **Finish and save.** Finish the current ride before starting another. For rides under one minute, the app offers save or discard. If saving fails, use the displayed retry/download options before closing the page.
6. **Keep a backup.** Use **Settings > Local backup** to download a copy. Saving in the browser alone does not protect against clearing site data, losing the device or browser storage being removed.

The **Coach** is optional. It builds a proposed schedule from your goal, availability and recorded history; it is not medical advice. Running plans provide running guidance and exports, not treadmill or cycling-trainer execution. See [Using the Coach](doc/coaching.md#using-the-coach).

### A few useful words

| Word | Plain-English meaning |
|---|---|
| Smart trainer | Indoor cycling equipment that can report readings and accept resistance commands. |
| Power / W | How hard you are working mechanically, measured in watts. |
| FTP | Functional Threshold Power: the cycling reference, in watts, used to scale targets. A target of 80% with FTP 250 W is 200 W. |
| Cadence / rpm | How many complete pedal turns you make each minute. |
| Heart rate / bpm | Heartbeats per minute. RR intervals are the times between successive beats. |
| ERG | Trainer mode that tries to hold a requested power by adjusting resistance. |
| Interval / step | A section of a workout; a section can contain smaller steps with different targets. |
| RPE | Your own rating of perceived exertion, on a 0-10 effort scale. |
| ZWO file | A text-based workout recipe that Too Many Watts can read. |
| FIT file | A compact recording of activity data, suitable for downloading or uploading to compatible services. |
| Backup / sync | A backup is a separate saved copy. Intervals.icu sync refreshes local history; it is not a backup of your complete Too Many Watts setup. |

For a guided tour of the files and code, start with the [beginner's code guide](doc/code-guide.md).

## What Too Many Watts does

- runs `.zwo` workouts and built-in structured sessions
- shows a live workout power timeline with a current-position marker, interval countdown, and separate target/actual power and cadence; cadence targets appear only when prescribed
- searches and filters the workout library by category, type, and duration, with power profiles and cadence previews
- controls smart trainers in ERG, resistance, and grade-simulation modes
- records `.fit` files with power, cadence, heart rate, and RR intervals
- supports session planning and direct launch from a multi-week calendar, with weekly ride totals and power profiles when data is available
- reviews activities across sports with weekly and monthly totals, available training-load indicators, and recorded power previews when samples exist
- imports and syncs activity history (all sports, with type icons) from Intervals.icu
- fetches full-resolution power, heart-rate and cadence streams plus route previews on demand, with CSV export
- uploads new FIT recordings back to Intervals.icu
- includes a local, rule-based coaching engine for cycling/running planning and activity review
- offers **Train Now**, an ad-hoc session chosen from readiness, recent load and history without changing the plan
- automatically switches between mobile and desktop layouts as the window width changes
- saves coaching, plans, workouts, recordings and calendar on this device
- downloads and restores local backup files without including integration credentials

## Ride screen

The application's default cyberpunk theme uses a locally bundled city backdrop,
angular dark panels, signal-yellow controls and cyan/magenta accents. Industrial
headings and a road leading toward a distant night skyline evoke a dystopian city interface,
without animation, flashing, external assets or changes to training-zone colors.
The ride screen retains its calmer mint controls and removes
decorative imagery and header accents to keep metrics and controls
distraction-free. The theme is included in production builds and Docker images,
with no external image or font requests. Styling lives in [cyberpunk.css](src/css/cyberpunk.css).
The locally bundled backdrop uses a 1920-pixel WebP for smaller displays and a
3840-pixel version for large or high-density desktop displays.

Backdrop photograph: [Krzysztof Kotkowicz, city skyline at night with a freeway in the foreground](https://unsplash.com/photos/a-city-skyline-at-night-with-a-freeway-in-the-foreground-VPnxo1uloJE),
used under the [Unsplash License](https://unsplash.com/license), brightness- and
color-adjusted. Both the road and buildings are photographic, not illustrated.
A stronger overlay over the skyline keeps the city secondary to the road and
the interface. All image assets are served locally.

Both `/` and `/mobile` automatically use the mobile layout at widths of 700px
or less and the desktop layout above that. Resizing or rotating switches layouts
without reloading, changing the current page, clearing forms, or interrupting a ride.
Mobile screens use compact cards and expandable secondary information: library
filters, workout notes and intervals, monthly activity totals, local backup
settings, additional sensors, the month calendar overview, and the plan timeline. Open sections retain their
state while navigating during the session; desktop shows this information expanded.
The mobile library shows six workouts per page with Previous/Next controls.
Ride metrics and controls stay visible, and the five-item bottom navigation is unchanged.
Long activity histories and setup forms still scroll so no information is clipped.

The ride screen keeps target power, interval time remaining and target cadence
above an always-visible workout power profile. A labelled position marker
follows the workout timeline, including skipped intervals; completed work is
dimmed and the current interval is outlined. Actual power and cadence remain
separate from their targets, and disconnected sensors show unavailable readings.
Cadence targets come from the workout and are hidden when none is prescribed;
actual cadence remains visible. Device connections and trainer settings are available
under "Devices & trainer settings" without hiding the profile.
Use "Choose a workout" beneath the ride controls to browse the library.
In workout details, "Start workout" opens the ride screen and starts the session.
Finish and save an existing ride before starting another workout.

The library includes gentle cadence-practice sessions and shows target cadence
ranges on workout cards and individual targets in workout details. The Coach
may include approved drills in suitable endurance slots; cadence is optional,
not a diagnosis or a universal target. Ride comfortably and stop or return to
your natural cadence if a drill causes discomfort or bouncing.

## Train Now

**Train Now** on the dashboard generates one cycling session for the current
moment and opens it in the ride screen. It ignores today's planned workout and
the calendar: no planned session is replaced, moved or marked, and the generated
session is not added to the library. It chooses from your Coach profile, goal,
recent completed sessions, load, readiness signals and the Coach's configured
rules. When Intervals.icu is linked, Train Now first refreshes the provider
profile and activity history. If refresh fails, you can cancel or explicitly
continue using the last known local Coach data.
Recovery is preferred when subjective readiness reaches the caution
threshold or recent load is well above baseline; quality work is considered only
when history and recovery support it, and the Coach avoids repeating the same
hard focus too often. The ride screen shows **Why this workout?** with the
reasons, and the explanation is kept with the recorded activity. Train Now is
available without an active plan, but requires a configured cycling profile and
FTP. Running profiles receive guidance to use the calendar instead.

## Current repo status

This repository is a standalone browser app. The main flow is:

- open the app and train without signing in
- run the complete Coach locally using IndexedDB
- connect Intervals.icu directly from Settings using a browser-stored API key
- export a backup before clearing browser data or switching devices


## Quick start

This section is for people running their own copy or editing the app. A
**terminal** is a window for typing commands. Open one in the downloaded project
folder; in VS Code, use **Terminal > New Terminal**.

### Local development

Requirements:
- Node.js 22.18.0 or later, with npm. Node runs development tools; npm installs
  the packages those tools need. Riders opening an already-hosted app do not need them.

```bash
npm install
npm start
```

`npm install` installs dependencies into the project; it does not install a
training server or create an account. `npm start` runs Parcel, the tool that
prepares the app and serves it while you edit. Open the local URL it prints.
Keep the terminal open while using that development server; **Ctrl+C** stops it.

Useful commands:

```bash
npm test
npm run build
```

`npm test` runs automated examples that check expected behavior. `npm run build`
creates browser-ready files in `dist/`; it does not publish them or start a
server. See [testing explained](doc/code-guide.md#reading-and-running-tests) for
smaller test commands and the limits of what they prove.

The regular test suite includes enforcing Trusted Types regressions for ZWO
parsing, timer-worker startup, service-worker registration and policy reuse across
separately loaded modules. Source guards also reject unwrapped XML and worker
sinks. These simulate enforcement; they do not replace an Android browser check.
Docker builds run the suite before packaging, so failing tests block publication.

For HTTPS development, use:

```bash
npm run starttls
```

This expects local certificate files at `dev_cert/cert.pem` and
`dev_cert/key.pem`. A certificate enables an encrypted HTTPS connection; the
private key must stay private. This command does not create or automatically
trust those files. Plain localhost development usually does not need them.

### Docker Compose

Docker runs a packaged copy of the web server in a **container**. Compose reads
a configuration file describing how to start it. This is an alternative to
local development, not an extra step every rider must perform.

The default Compose setup serves only static frontend files. No backend or database service is needed.
The frontend runs as UID/GID 101 on container port 8080, with a read-only
filesystem, no Linux capabilities, no privilege escalation and a bounded
temporary filesystem. The container includes a health check.

```bash
docker compose up -d
```

Then open:

- http://localhost:8080

For the existing Dockhand `bike_trainer` stack, use [compose.dockhand.yaml](compose.dockhand.yaml).
It preserves host port 1111 for the existing HTTPS proxy, forwarding to container
port 8080. TLS remains handled by your existing proxy; no Caddy or backend is
needed in this stack. Replace the stack's Compose content with this file and
redeploy after publishing the new frontend image.
The frontend service is named `too-many-watts`. If the previous deployment used a
different service name, remove the obsolete frontend container without deleting
volumes before redeploying, so it cannot retain host port 1111.
The old backend is no longer needed. Stop/remove its container separately if
Dockhand leaves it as an orphan; preserve its data volume until any old data
has been exported. Do not use volume deletion during this upgrade.

To stop it:

```bash
docker compose down
```

To build from a local checkout instead of using published images:

```bash
docker compose -f compose.yaml -f compose.server.yaml up --build -d
```

For public HTTPS hosting, replace `app.example.com` in [Caddyfile](Caddyfile) with your
hostname and run:

```bash
docker compose -f compose.https.yaml up -d
```

To build the HTTPS frontend locally instead:

```bash
docker compose -f compose.https.yaml -f compose.server.yaml up --build -d
```

Caddy manages TLS certificates, sets HSTS and keeps certificate/configuration
state in its named volumes. Its root process retains only the capability needed
to bind ports 80/443; the frontend is non-root and has no capabilities.

The build and server base images are pinned by digest, and `npm ci` uses the
committed lockfile. Refresh these pins and the lockfile regularly for security
updates; pinning does not automatically apply upstream patches.
Rebuild/publish before using these Compose files with a published image:
older frontend images listen on port 80 rather than 8080.

### Deployed versions

The desktop app shows the frontend version at the bottom of the left-hand menu;
the mobile layout omits it. Published images display the GitHub Actions build
number and attempt. Hover over the version for the full Git revision.

Local development and local image builds show `development` unless build metadata
is supplied. The frontend label identifies the code currently loaded in the
browser, so reload the app after deploying a new frontend.

### Verifying a published image

Published images carry build provenance and a software bill of materials, and
are signed with the release workflow's short-lived GitHub identity. The example
Compose files use the moving `latest` tag for convenience. To deploy exactly
one reviewed build, resolve the digest and pin it:

```bash
docker buildx imagetools inspect ghcr.io/tomvlf/too-many-watts:latest
# then in compose.yaml:
#   image: ghcr.io/tomvlf/too-many-watts@sha256:<digest>
```

With [cosign](https://docs.sigstore.dev/cosign/overview/) installed, check the
signature before pulling:

```bash
cosign verify ghcr.io/tomvlf/too-many-watts:latest \
  --certificate-identity-regexp 'https://github.com/tomvlf/Too Many Watts/.github/workflows/publish-image.yml@refs/(heads/master|tags/v.*)' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

A digest-pinned deployment only changes when you update the digest; the
`pull_policy: always` setting then confirms the pinned image is present.

## Local data and integrations

The Coach, activity history, calendar, workout library and ride recovery use browser storage. Data is not synchronized between browsers or devices. Clearing site data or browser eviction can remove it; use Settings > Local backup regularly.

The dashboard's recent-duration summary is cycling-only. The Activities page's
week/month totals include dated activities across sports. Coach load estimates
remain specific to the selected sport; different load scales are not added
together. A total labelled **Known** is incomplete because some measurements
are missing.

Intervals.icu is optional and requires internet access. In Settings, enter your
personal API key and import start date. By default the key is saved in this
browser's local storage so the connection survives a tab close; clear **Keep
this connection on this device** to keep it only for the current tab. It is
sent only to `https://intervals.icu` and is not encrypted against someone with
access to your browser profile. Disconnect removes the key but keeps imported
history. **Settings > Delete local data** also erases it, along with all other
Too Many Watts data on this device. There is no Too Many Watts server or intermediary.
Strava and TrainingPeaks server-based OAuth connections have been removed;
use FIT file downloads for manual upload to other providers.

For the practical details, see [where data lives and how backups work](doc/backend.md),
[connecting Intervals.icu](doc/intervals-guide.md) and [using the Coach](doc/coaching.md).

Older account-scoped browser data and server volumes are not deleted or silently
merged. Export data from the previous version before upgrading; see the migration
notes in the backend guide.

## Browser and device support

Too Many Watts relies on browser features such as Web Bluetooth (talking to nearby
sensors), Web Serial (communicating with supported adapters) and Web Components
(reusable interface elements). For a supported experience, use a compatible
browser and a **secure context**: HTTPS, or localhost on your own computer.

Supported browsers:
- Chrome
- Edge
- Opera
- Brave
- Samsung Internet

Important notes:
- Bluetooth requires HTTPS or localhost
- Android generally works best by opening the URL directly in Chrome
- Firefox and Safari are not supported for the trainer/Web Bluetooth path

On Android, open the HTTPS app in Chrome and use the browser menu's **Install
app** or **Add to Home screen** option. The installed app uses the Too Many Watts
icon, including a maskable variant for Android launchers. Chrome may take time
to refresh the icon of an existing installation after an update; close old app
windows so the updated offline worker can activate.

### Linux

On Linux, enable the experimental web platform flag if needed:

- Chrome: `chrome://flags/#enable-experimental-web-platform-features`
- Edge: `edge://flags/#enable-experimental-web-platform-features`
- Opera: `opera://flags/#enable-experimental-web-platform-features`

### iOS

The web version is not currently supported on iOS.

## Supported trainer protocols

Too Many Watts supports the industry-standard trainer and sensor protocols used by indoor bikes:

- FTMS over Bluetooth
- FE-C over BLE
- Wahoo CPS
- ANT+ FE-C via a compatible USB ANT+ adapter

## Static hosting

Serve the built `dist/` directory over HTTPS, or use localhost for development.
The Compose HTTPS variant adds Caddy in front of the static frontend only.
No authentication cookie, server encryption key or server-origin configuration
is required. Training and coaching can work offline once the needed app files
are cached, meaning the browser has kept copies. Offline loading is best-effort,
not a backup: not every image/resource is cached, and browser cache removal can
prevent a later offline launch. Check offline reopening before relying on it.
Intervals.icu requests require a connection and permission from that service
for cross-site browser requests (CORS).

The Docker build generates a Content Security Policy from the exact built HTML,
including hashes for Parcel's inline import map. Scripts cannot use arbitrary
inline code or `eval`; connections are limited to this origin and Intervals.icu.
Trusted Types (`require-trusted-types-for 'script'`) requires every HTML update,
XML parser input and worker script URL to pass through the app's single
`too-many-watts` policy, so a plain string cannot be assigned to an enforced sink. XML
remains parsed as inert XML rather than HTML, and worker scripts are restricted
to same-origin URLs. Inline styles remain allowed for the existing dynamic
UI. Anti-framing, cross-origin isolation, MIME-sniffing, referrer and
device-permission headers also apply to error pages. Other static hosts must
configure equivalent headers themselves. Do not reuse the generated CSP after
replacing assets without rebuilding its import-map hashes.

## Documentation

| I want to... | Read |
|---|---|
| Use the app and understand its terms | This README |
| Understand the code without a programming background | [Beginner's code guide](doc/code-guide.md) |
| Know where data lives, back it up, or host the app | [Storage, hosting and migration](doc/backend.md) |
| Connect another training service | [Intervals.icu guide](doc/intervals-guide.md) |
| Understand planning, feedback and scientific limitations | [Coach guide](doc/coaching.md) |

## License

This project is licensed under the terms in [LICENSE.txt](LICENSE.txt).
