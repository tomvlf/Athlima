# Intervals.icu integration guide

## What connecting does

Intervals.icu is a separate online training service. Connecting it lets Athlima
copy activities into your local history, read planned workouts and send recorded
FIT rides back to that service. **You can use Athlima without connecting it.**

The connection goes directly from your browser to Intervals.icu, not through an
Athlima server. Your Coach plans and imported history are still saved in this
browser. Connecting is not automatic synchronization of your complete Athlima
setup between devices; use a [local backup](backend.md#back-up-and-restore) for that.

An **API** is a way for one program to exchange data with another. A personal
**API key** is a credential that authorizes this exchange, similar to a password.
It is not a value to paste into source code, screenshots, bug reports or a URL.

## Connect

1. Get your personal API key from Intervals.icu Settings.
2. Open **Athlima Settings**, find Intervals.icu, and enter the key and history
   start date. That date controls how far back the first import goes.
3. Choose **Test & connect**. Athlima checks which athlete the key belongs to;
   you do not need to enter an athlete ID yourself.
4. FTP and body mass are refreshed automatically. Choose **Import history** and
   keep the app open while it works. Check the displayed progress and any errors.

FTP is the cycling power reference used to scale workout targets, and body mass
is your weight. While connected, Athlima treats Intervals.icu as the source of
these two values and makes local editing read-only.

### How the key is handled

The key is stored in local storage in this browser profile by default, so the
connection survives closing the tab. Clear **Keep this connection on this
device** when connecting to keep it only until the tab closes (it then uses
per-tab session storage instead). Requests use HTTPS Basic authentication with
username `API_KEY`; the key never appears in a URL or local backup. It is not
encrypted against someone with access to your browser profile, and same-origin
scripts can read it. Use a trusted browser profile, avoid remembering the key
on shared devices, and revoke the key in Intervals.icu if it is exposed.
**Settings > Delete local data** also removes the key from both stores.

For developers: requests use `https://intervals.icu/api/v1`; `/athlete/0`
resolves the real athlete ID for later calls. The key is sent in the
Authorization header, not a query parameter. Requests omit cookies, reject
redirects, avoid response caching and have a timeout.

## Local history and coaching

**Sync** means fetch and refresh local history. To keep a large import
manageable, Athlima works through 31-day date batches, like reading a book a
chapter at a time. It checks the received activities before saving them.

All sports are imported. Cycling contributes to cycling coaching; running
contributes to running coaching. Other sports' training loads are not mixed
into the selected sport's plan, although recent subjective feedback can
contribute to caution. Available summary measurements, activity types and
compact power/heart-rate previews are retained.

Progress is saved after each batch. A failed or interrupted import resumes from
the saved date on retry. New syncs recheck the last seven days since the previous
successful sync, preserving subjective feedback and resolved session outcomes.
Invalid activities are explicitly listed as skipped in Settings.

Repeated imports update matching records rather than simply appending copies.
Imported provider information does not erase your own recorded feedback.
The Activities page's week/month totals include all dated sports; the
dashboard's recent cycling summary and the Coach's sport-specific load
calculations serve different purposes.

A connected app starts a sync when opened. There is no background server:
closing the app stops the import. Overdue sessions are reviewed after the
final import batch, so completed rides can be matched first. Failed imports
keep existing history and completed batches, and show an error; choose
**Sync now** to retry. The whole import is not one transaction that rolls all
earlier batches back.

## Planned workouts, routes and uploads

- The calendar fetches planned workouts directly for its visible date range and
  saves fetched workouts locally so they remain available after reload or offline.
- FTP and body mass refresh before the app becomes usable on every launch.
  While connected, profile inputs in Settings and the device controls are
  read-only; change these values in Intervals.icu instead. **Refresh Intervals.icu
  profile** or **Sync now** fetches them again without restarting.
  A failed or invalid profile response retains both cached values and shows an
  error, without enabling local overrides. Update an active plan after a provider
  FTP change by archiving and regenerating it.
- **Route & data** fetches full-resolution measurement streams and route
  geometry on demand. A stream is a sequence of readings over time; route
  geometry is the set of coordinates used to draw a route outline. These
  details are held in page memory, not a permanent map download.
  Chart previews may use fewer points to stay responsive; CSV export uses the
  retained full-resolution streams. CSV is a table file that spreadsheet
  programs can open.
- Uploading a recorded ride sends its FIT file as multipart form data to the
  resolved athlete. A stable `athlima:` external ID prevents re-import from
  duplicating the local recording. Only this prefix links imports to local
  recordings; activities with other external-ID prefixes import separately.

The stable ID is a label that lets a later import recognize an uploaded local
ride. Uploading a FIT file does not upload your whole Athlima database, backups
or Coach plan. Disconnecting or deleting a local record does not delete a copy
already uploaded to the provider.

Some provider-origin activities, including Strava-origin data, may not expose
streams or routes through the Intervals.icu API.

## Offline use and disconnect

Workout execution, local recordings, saved history and coaching do not require
Intervals.icu or a network connection. Sync, planned-workout refresh and uploads
require internet access and Intervals.icu browser CORS support.

**CORS** is the provider's permission for a website to make requests from a
browser. It is not a password setting you can fix by changing your API key.
An offline launch also depends on the browser having cached the necessary app
files; see [storage and offline-cache distinctions](backend.md#where-your-data-lives).

**Disconnect** removes the locally stored key and connection settings (from both
long-term and per-tab storage) but retains imported coaching history and
re-enables local FTP/body-mass editing.
Reconnect separately on another browser or device;
backup files intentionally do not include API keys.

Authentication, rate-limit, network and malformed-response failures are shown
explicitly. No request falls back to an Athlima server.

### If something goes wrong

| Message or situation | What to do |
|---|---|
| Key rejected | Check/reconnect with a valid key from Intervals.icu. Do not share it when asking for help. |
| Rate limit | The provider is limiting requests. Wait, then retry; completed import batches are retained. |
| Offline / provider unreachable | Restore connectivity and retry. Your previously saved local history is still separate from the request. |
| Invalid profile | Check that Intervals.icu supplies both a valid cycling FTP and body mass. Cached values remain and local editing stays locked while connected. |
| Route or measurements unavailable | Some source activities do not expose this data. An empty chart is not proof the activity had zero power or no movement. |
| Connection changed in another tab | Use the current connection state and retry; an old in-flight request must not overwrite the newer connection. |

## Code and tests

- [Browser integration](../src/models/intervals.js)
- [Provider activity mapping](../src/models/intervals-data.js)
- [Integration tests](../test/models/intervals.test.js)
- [Local coaching](../src/coaching/service.js)
