# Browser-only deployment and migration

## The short version

**Your browser does the training work and keeps your training data.** A web
server only delivers the app's files, much like handing you a blank notebook.
Your rides, plans and settings are then written into storage belonging to your
browser, not into a training database on that server.

The filename is historical. A **backend** normally means a separate application
running on a server to process requests or store accounts. Athlima no longer
has an account backend, login, registration, server-side Coach or server backup
API. Optional Intervals.icu requests go directly to that external service.

```text
Web host -------- app files --------> Your browser <----> Trainer/sensors
                                          |
                                          +--> Browser storage: rides, plans, settings
                                          +--> Downloaded backup file: a separate copy
                                          +--> Intervals.icu: optional online exchange
```

Browser-only does not mean anonymous: a hosting operator can still keep normal
web access logs. It means the static host receives no application training-state
uploads. A backup or an Intervals.icu upload also creates a copy outside browser
storage. For the code behind this flow, see the [code guide](code-guide.md).

## Where your data lives

| Place | What it means | What Athlima keeps there |
|---|---|---|
| Live page memory | Temporary working data while the page is open | Current readings, unsaved work and detailed charts fetched on demand. It is lost when the page closes. |
| IndexedDB `store` | A browser database for larger records | Saved workouts, recent FIT recordings and ride-recovery checkpoints. |
| IndexedDB `athlima-coaching` | A separate browser database for the Coach | Full activity history, profile, goal, plans, dated estimates and revisions. |
| Local storage | A browser cupboard for small named settings | Profile/device preferences, calendar entries and the optional Intervals.icu connection/key. |
| Offline cache | Browser-held copies of website files | Eligible app files for later loading; not a backup of training data. |
| Downloaded backup | A file you keep separately | The exported data listed below, without the integration key. |

The recent FIT cache normally holds seven recordings, but recordings still
awaiting the local Coach hand-off are protected from removal. Full Coach
history is separate; it is not limited to seven activities.

### Why a different address can look empty

Browser storage belongs to one **origin** and one browser profile. An origin
is the combination of scheme (`http` or `https`), hostname and port.
`http://localhost:8080` and `https://app.example.com` therefore have different
storage. So do different browser profiles, even on the same computer.

Changing an address can make saved data appear absent without deleting it.
Athlima does not automatically move it between addresses, browsers or devices.
Make a backup first, and keep the old browser/address available until you have
checked the restored copy.

## Back up and restore

1. Finish the current ride and confirm it was saved.
2. Open **Settings > Local backup** and download a backup.
3. Keep the downloaded file somewhere safe, preferably with another copy away
   from this device. It contains private training information.
4. To move devices or addresses, open Athlima at the destination and select the
   backup in **Local backup**. Review the confirmation before restoring.
5. Check your workouts, calendar and Coach history/plan afterward. Reconnect
   Intervals.icu separately if you use it; its key is intentionally excluded.

The current backup is a **version-2 JSON file**. JSON is structured text, not a
program to run. Do not edit it unless you understand the format.

| Included | Restore behavior |
|---|---|
| Saved workouts and calendar-referenced workout copies | Merged by their identifiers; a matching identifier is updated. |
| Cached FIT recordings | Merged by identifier, preserving their file bytes. |
| Manual calendar and fetched planned-workout data | The supplied saved data replaces the corresponding local values. |
| Allowed settings | Restores FTP, body mass, theme, dock layout, measurement units, volume and data-tile choices (`ftp`, `weight`, `theme`, `dockMode`, `measurement`, `volume`, `dataTileSwitch`). This is not every possible preference. |
| Full Coach state | Replaces local Coach state with the backup's history, profile, goal, plan and revisions; it does not merge two training plans. |

API keys are not included. Downloading a backup does not remove anything from
the app. Restore can replace existing data, so download a current backup before
restoring an older one.

**Restore is not one all-or-nothing operation across every storage system.**
Workout/recording writes use a database transaction, but settings and Coach
storage are separate. An error can report that part of the restore already
succeeded. Read that message, check the data and retain both backup files;
do not assume either that everything was restored or that nothing changed.

## Running or hosting your own copy

Ordinary riders can skip this section if the app is already hosted for them.
**Development** means running editable source; **production build** means
preparing files to serve to browsers. Neither requires an Athlima database server.

Install Node.js 22.18.0 or later with npm, open a terminal in the project folder,
then run:

```sh
npm install
npm start
```

The first command installs development packages. The second starts Parcel and
prints the local address to open. Stop it with **Ctrl+C**. To prepare the site
for hosting instead:

```sh
npm run build
```

Serve the resulting `dist/` directory over HTTPS or localhost. HTTPS encrypts
the connection; Web Bluetooth needs it or the special localhost development
exception. A successful build does not itself publish the website.

### Which deployment file does what?

| File | Purpose |
|---|---|
| [Dockerfile](../Dockerfile) | Builds the app with Node, then copies only the result into an Nginx web-server image. |
| [compose.yaml](../compose.yaml) | Runs the published frontend on host port 8080. |
| [compose.server.yaml](../compose.server.yaml) | Overrides a base Compose file to build the frontend from your checkout. Despite its name, it adds no backend. |
| [compose.dockhand.yaml](../compose.dockhand.yaml) | Keeps host port 1111 for the existing external HTTPS proxy. |
| [compose.https.yaml](../compose.https.yaml) | Runs the frontend behind Caddy for public HTTPS hosting. |
| [Caddyfile](../Caddyfile) | Names the public hostname and forwards requests to the frontend. Replace the example hostname with one you control. |
| [nginx.conf](../nginx.conf) | Serves app files, maps `/mobile` to the same page and rejects writes/hidden-file requests. |

A **container image** is the packaged software; a **container** is a running
copy. A port is a numbered network entrance. Compose mappings are
`host-port:container-port`, so `1111:8080` means callers use 1111 and Nginx
receives the request on 8080.

Use the exact [Compose commands in the README](../README.md#docker-compose).
No server database, authentication cookies, integration encryption key or
trusted-origin environment variables are required.

### Hosting safeguards, explained

The hardened frontend container listens on port 8080 as UID/GID 101. Compose
enforces a read-only filesystem, drops all capabilities, prevents privilege
escalation and mounts only bounded temporary storage. In plain language, the
server runs as a restricted user, cannot rewrite the app files and has only a
small temporary working area. These restrictions do not store or back up a
rider's browser data.

The build uses a lockfile
and digest-pinned base images; update these deliberately for upstream patches.
The lockfile fixes package versions, and an image digest identifies one exact
image; neither automatically installs future fixes.

HTTP responses include a build-specific **Content Security Policy (CSP)**,
a browser allowlist for permitted resources. It allows the generated import map,
local scripts/workers and direct Intervals.icu access, but no arbitrary inline
scripts, framing or plugins. Inline styles are retained for the dynamic UI.
An import map tells the browser where packaged JavaScript modules live.
The policy includes hashes, or content fingerprints, of exact built inline
scripts. Rebuild the policy when those files change; do not make it permissive
just to silence a browser error. Other static hosts need equivalent headers.

The HTTPS variant adds **HSTS**, telling browsers to keep using HTTPS.
Caddy's certificate/configuration data lives in named volumes, which survive
container replacement. These are hosting files, not training backups.
Older published frontend images use port 80; rebuild/publish before deploying
the updated port-8080 Compose configuration.

## Upgrading from the account-backed version

This section matters only if you used an older version with accounts. A
**migration** is moving old data into the new storage arrangement.

Before upgrading, use the previous version to export coaching history and
download device backups. The new version opens the existing unscoped local
database and local coaching state; it does not automatically select or merge
any account-scoped browser database or server history.

Version-1 device backup files from the previous version can be restored through
Settings > Local backup. They contain device files/settings/calendar, not
coaching history. Exported coaching activity arrays can be imported through
Coach's JSON history import. New version-2 backups also restore the full Coach
profile, goal, plan and revision state.

Existing server volumes and account-scoped browser data are left untouched.
Do not delete them until you have verified exports and local restoration.
When updating an existing Compose deployment, explicitly stop/remove the old
backend container; the new Compose configuration does not start or expose it.
Keep its data volume until migration is verified.
