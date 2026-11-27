# Adaptive cycling and running coaching

The **Coach** helps turn a training goal into a dated schedule, then reviews
that schedule as activities and feedback arrive. It uses repeatable rules,
not a chatbot or external AI service. "Deterministic" means that the same
inputs, dates and rules produce the same result.

It is training support, not a medical professional. It does not diagnose illness
or injury or measure whether your body is ready to train. Its rules include
**heuristics**: practical estimates and limits, not validated predictions of
what will happen to an individual athlete.

Coaching, planning, the workout player and trainer engine run locally in the
browser. No login or backend is required. See the [storage and migration
guide](backend.md) for local backups and recovery details.

On the Ride screen, choose a library workout before starting. Finishing a ride
shorter than one minute offers the choice to save or discard it. In Activities,
delete an Too Many Watts recording to remove its local FIT file and coaching history.
Previous plan decisions and uploads to external services are not undone;
an external copy may reappear when that service is synchronized. Existing
downloaded backup files are not changed until you create new ones.

Consumer power meters, heart-rate sensors and other wearable data can be
incomplete, noisy or inaccurate. Missing data is not evidence of rest or
readiness. HRV is not currently used; neither HRV nor sleep quality should be
used as an isolated verdict about whether to train.

## Start here: the simple picture

1. **You provide a goal and available time.** The Coach cannot know when you
   can train unless you tell it.
2. **It reviews the history it has.** Missing activities or measurements remain
   missing; they do not prove rest, recovery or improved fitness.
3. **It proposes sessions that fit the rules and calendar.** A session includes
   its purpose, duration and available target/effort guidance.
4. **You train and review the result.** A planned workout and a recorded
   activity are different things. Matching links the activity to the plan.
5. **It can adjust upcoming work and explain why.** A missed session is not
   automatically squeezed into another day, and completed prescriptions are
   not rewritten.

For example, after you mark a session missed, nearby scheduled sessions may
be shortened. The original plan, the changed version and the reason are kept
as a record. A missing power reading does not become a made-up zero, and a
similar ride duration alone does not prove that the intended hard intervals
were completed.

For the dashboard's “Today” recommendation, the Coach derives a fresh dated
athlete-state snapshot for the local day before presenting planned work.
The UI shows that snapshot date. If setup is incomplete, no active plan exists,
or the snapshot is missing or stale, it gives an explicit review/setup fallback
instead of implying medical clearance or complete evidence. Limited or monitor
readiness evidence also asks for review rather than assuming quality eligibility.

Read [Using the Coach](#using-the-coach) and, if relevant, [Running coach](#running-coach)
first. The later architecture, formulas and scientific references are optional
technical detail. [Estimation limitations](#estimation-limitations) explains
what the numbers cannot tell you.

### Words used in this guide

| Term | Meaning here |
|---|---|
| Profile | Your declared sport, reference values, experience and available training time. |
| FTP / threshold pace | The reference used to scale cycling power or running speed. They are not interchangeable. |
| RPE | Your own 0-10 rating of how hard an activity felt. |
| Session / activity | A session is planned work; an activity is a record of what happened. |
| Family / template | A family is a kind of training, such as endurance. A template is a reusable workout recipe. |
| Phase / taper | A phase is a period with a training purpose. A taper reduces volume before the goal event. |
| Load / dose / budget | Estimates of how much training is involved, and how much the rules allow. Scores from different measurement systems must not be added together. |
| Progression | A possible increase after sufficiently supported successful sessions, not simply because another week passed. |
| Snapshot | A dated copy of derived information about the athlete, based on the available evidence. |
| Revision / adaptation | A saved plan version / a reasoned change that produces another version. |
| Provenance / confidence | Where a value came from / how well the available evidence supports it. Confidence is not certainty. |
| Readiness | A labelled monitoring/caution result from software rules, not medical clearance or a direct body measurement. |

## Using the coach

### Simple daily entry

The dashboard's Today view shows the active sport and goal, the local-day
evidence state, and one primary recommendation. The goal can be edited with
only sport, goal type and timeline; existing profile, availability, feedback
and event details remain in the full Coach and are not replaced by partial
updates. A goal change is previewed before it can rebuild the active plan.
Accepting is explicit and atomic; cancelling leaves the active plan unchanged.

**Coach** guides you through four numbered steps. Setup requires confirmation
that the athlete is an adult (18 or older); it does not collect a date of birth.

1. **What are you training for?** Goal name, type (grouped into *Cycling* and
   *Running*; the goal type selects the sport), priority and a time frame
   (about 6 weeks, 3 months, 6 months or a year). Event details such as an exact
   event date, distance, climbing and targets are optional; an event date
   replaces the time frame. Power targets are only shown for cycling goals.
2. **Check your athlete profile.** Body weight comes from **Settings** and is
   required. Cycling uses FTP from **Settings**; without FTP, sessions use effort
   (RPE) guidance. Its optional last-tested date lets the plan flag an undated
   or older FTP for review. Running asks for a threshold pace (min:sec per km or
   mile), or a recent race distance and finish time from which threshold pace is
   estimated; without either, runs use effort guidance. Its optional performance
   date is used for the same reminder.
3. **When can you train?** The longest session per weekday in minutes (0 for
   rest days), an indoor/outdoor preference per day, a long ride / long run day,
   weekly hours and experience in this sport.
4. **Create your plan.** Recorded Too Many Watts rides are included automatically; for
   runs and better targets connect **Settings > Intervals.icu** first, or import
   activities later under **Training history and backup**. Current Too Many Watts
   summaries retain available duration, distance, power, heart rate, cadence,
   FTP and previews; older summaries may contain less. The recent FIT cache
   normally holds seven recordings, with pending Coach hand-offs protected.
   Full Coach history is stored separately and is not limited to seven rides.
   **More options** holds the start date, time zone, heart-rate values and equipment.
   An intensity threshold over 90 days old triggers a recalibration reminder,
   not an automatic rejection: 90 days is a heuristic and not a validated
   physiological expiry date.

Once a plan is active, Coach shows the goal countdown, current phase, next
session and upcoming sessions, plus post-ride feedback, plan adjustments and a
**Why this plan?** explanation. The **Training plan** page shows the whole plan:
progress towards the goal and the next session, a colour-coded phase timeline
with a plain-language legend, and the plan week by week (this week open, the next
four weeks listed, earlier and later weeks folded away). Recent plan changes and
the technical planning rationale are kept in collapsed sections.

Sessions come from the built-in workout library where possible. For each day,
the Coach decides the session family, available duration and earned progression
level, then selects a safe library workout that fits. Dose fit is ranked ahead
of variety; variety breaks near-equal fits. Approved gentle cadence sessions
may be selected for optional skill practice in suitable endurance slots when
their fit is close to the best candidate. During adaptation, an already
selected workout is retained when it can be fitted safely. Adjustments appear
under the session ("Adjusted for you: …"). An interval template is reduced only
by complete repetitions. Warm-up, interval recovery and cool-down steps marked
as protected are not shortened to make a session fit. Library workouts with
unsupported free-ride sections, targets above the configured power limit, tests
and unapproved technique drills are not prescribed. When no safe template fits (for
example, a sprint slot), the Coach explains that it generated a conservative
session instead.

Cycling sessions are initially capped at 125% of the longest recent session,
then use the prior week's scheduled session as a planning projection. This is a
conservative engineering heuristic, not a validated safe progression rate.
Session caps apply to scheduled sessions from the adaptation date onwards;
completed sessions are history and are not re-judged when an earlier session is
later marked missed. Plans saved before the cycling cap existed use the longer
of 60 minutes and their first week's longest planned ride as the pre-plan
reference. Until overdue sessions are marked missed, they and any unmatched
activities of the week count against its remaining budget, so later sessions
can be briefly shorter until the next sync or app start resolves them.
After at least 14 days without a recorded activity in the coached sport, the
following weeks are staged as a return to training. A break of up to 28 days
limits each week to 50% and then 75% of its planned dose; longer breaks use
33%, 50% and 75%. The stages last as long as the break (at most 63 days) and
are counted from the first activity after it, so recording the first session
back does not end them. Hard sessions return only at the 75% stage. The plan
start date counts as active, so a new plan without recent history is not
treated as a break. These shares are adapted from Daniels' return-from-break
guidance: expert coaching practice, not trial-validated rules. The app cannot
determine whether a break was due to illness, injury, travel or missing
imports; use the pause control for symptoms and review the plan before resuming.

Progression levels are based on successfully completed or substituted sessions
with a sufficient match-quality score, not on how many workouts were scheduled.
Hard-session progression additionally requires interval evidence: an
Intervals.icu interval summary, or a one-second power stream (such as an
Too Many Watts recording) whose 3-second average stays at or above 90% of the lowest
planned hard target for at least 85% of the planned hard time. Duration and
average intensity alone do not establish that intervals were completed, so runs
need an interval summary. After the configured number of successful sessions in a family, a later workout
may progress one level only if there is unused weekly load capacity. Missed,
failed or low-quality work does not earn progression. Day to day:

- Start generated sessions from the calendar, or export individual ZWO files.
   Day preferences, purpose, expected RPE and the reason for each session are
   recorded. ZWO powers are fractions of FTP, not absolute watts.
   Calendar session details show the coaching explanation with the workout metrics
   and power profile, with export and other available controls on a separate row.
   In-app Start is available only for today's unresolved sessions in the active
   plan; future/archived sessions cannot accidentally be executed as today's
   prescription. Without FTP, follow the duration/RPE guidance instead of
   executing power targets.
- Recorded Too Many Watts rides update the coach automatically. Imported rides can match
   sessions too. Confirm a duration-only ride with **Use substitute**; duration
   alone is intentionally insufficient for automatic matching.
- Submit post-ride feedback, mark unsuccessful sessions **Not completed**, mark
   missed sessions, or choose **Make upcoming training easier**. Overdue sessions are reviewed
   when the app opens, after a recording, or with **Review missed sessions**.
   Direct Intervals.icu sync runs only while the app is open; its progress is
   saved locally for retry.
- Report pain or illness in **Symptoms and training pause**. This persistently
   pauses coached starts, exports and missed-session review and reduces upcoming
   training. Clearing the report does not mean the app has medically cleared the
   athlete; concerning, persistent or worsening symptoms warrant qualified
   healthcare assessment.

The first implementation supports one athlete and one active goal at a time,
over a 1-366 day horizon. Archive a plan before reconfiguring or generating a
replacement. Archived revisions and their goal definitions remain in history.
FTP is captured from the existing profile when configuring; after changing FTP,
archive and regenerate before starting a generated workout. The player rejects
a coaching selection with a different FTP rather than silently raising watts.
Other profile changes likewise require reconfiguration for future plans.
Do not stack the coach's prescription with separate library or Intervals.icu
sessions; choose a substitution and let the completed ride update the coach.
An active plan created before adult confirmation remains visible but cannot be
started or exported; archive and reconfigure to confirm adulthood. New training
history does not automatically add hard sessions to a previously generated plan:
when history becomes sufficient for a plan generated without hard sessions, the
plan shows a warning; review the data, then archive and regenerate if it should
affect the schedule. Warnings from plan generation (undated or old FTP/threshold
pace, race readiness) remain visible after every adaptation.

## Train Now

**Train Now** (dashboard) asks the same Coach rules for one ad-hoc cycling
session and starts it immediately. It deliberately does not read today's
planned workout and does not reschedule, complete or replace anything in the
plan or calendar. The generated session exists only for that ride and is not
saved to the workout library. The recorded ride still enters training history
and load estimates, but it is treated as unplanned and does not trigger plan
adaptation or revision changes.

When Intervals.icu is linked, the athlete profile and activity history are
refreshed before the selector reads the local coaching state. If a provider
refresh is already running, Train Now waits for it. If refresh fails, the rider
can cancel or explicitly continue using the last known local Coach data.

Inputs are the athlete profile, goal, completed sessions before today, recent
hard-session spacing, acute/chronic load, readiness signals, data sufficiency
and the configured `coachingConfig`. The selector prefers a recovery ride when
subjective signals reach the caution threshold or the 7-day load is well above
the 42-day baseline. It considers a hard session only when data sufficiency is
supported, load is not elevated, the configured hard-session spacing allows it,
the current phase is not recovery/taper and recent planned sessions were not
repeatedly missed. Quality focus is chosen from the goal's capability weights
and penalised when that family was used recently. Duration uses the configured
limit for today when available, otherwise a typical session length, capped by
the recent longest session and the configured spike limit.

When today's Coach guidance is recovery and rest, the dashboard and Coach expose
the optional **Feeling like riding today?** action. That action uses the same
selector but forces a recovery-family session; the calendar remains a rest day,
and the generated ride is still recorded as an unplanned Train Now session.

The **Why this workout?** panel on the ride screen shows the reasoning (readiness,
load, recent sessions, missed sessions, phase and progression level). The same
text is stored with the recorded activity and shown under its metrics. This is
decision support from the same heuristics as the planned Coach, not a diagnosis
or a guarantee of the best possible session. Running profiles are directed to
the calendar, because the player executes cycling workouts only.

## Running coach

Choosing a running goal type (general running fitness, first 5 km, 5 km,
10 km, half marathon, marathon, ultra / trail) plans runs with the same engine,
phases, readiness rules and adaptation as cycling. Only the session content,
the load scale and a set of running-specific safety rules differ. The rules and
their evidence are summarised in [Scientific review](#scientific-review).

**Intensity and load.** Running intensities are fractions of *threshold speed*
(the speed you could hold for about an hour), so the shared step format and
validators still apply. Easy runs are at 80%, threshold repetitions 98%,
VO2max intervals 107% and short repetitions and strides 115% of threshold
speed. A recorded run's load is `hours x (average speed / threshold speed)^2 x
100`, a low-confidence, rTSS-like proxy using average rather than grade-adjusted
pace. Planned load reuses the interval-weighted power-load calculation on
threshold-speed fractions. These are engineering estimates, not validated rTSS;
planned and recorded interval loads can differ even with exact execution.
Equal running and cycling scores do not imply equal physiological or injury
stress, and their training loads are modelled separately. Subjective feedback
from recent other-sport activities can raise fatigue caution, but their duration
is not combined into the coached sport's load budget.

**Threshold pace.** Enter it directly, or enter a recent all-out race. The race
time is converted to a one-hour equivalent with Riegel's formula
(`T2 = T1 x (D2 / D1)^1.06`); for example 5 km in 25:00 gives about 5:15/km.
Without a threshold pace the plan still works, but sessions are described by
effort (RPE) and recorded runs have no pace load.

**What the plan contains.**

- *Run-walk for novices.* Beginners whose longest recent run is under 30
  minutes start with run-walk intervals: 1 min run / 90 s walk without recent
  runs, 2 min / 1 min after runs of 10-20 minutes, and 5 min / 1 min after
  runs of 20-30 minutes. The stage advances every two weeks (up to 8 min run /
  1 min walk) before continuous running, so a complete novice run-walks for
  about 12 weeks. Run-walk sessions are never hard, and beginners are limited
  to four running days per week. After the plan starts, a beginner's run may be
  at most one stage beyond the hardest format completed in the previous 14
  days (the plan's first stage when none was completed), so the calendar alone
  never advances the stages; the planned format returns once completed runs
  catch up. These stages, this ceiling and the frequency cap are coaching
  heuristics, not a trial-validated beginner or injury-rehabilitation programme.
- *Single-run spike cap.* No planned run may be more than 10% longer than the
  duration reference for the previous 30 days. This is a **duration-based
  heuristic** inspired by Frandsen et al. 2025, whose observational study measured
  **distance**, not duration. It does not establish a safe threshold or prove
  injury prevention. Dated completed sessions use their actual duration;
  missed, failed and overdue unresolved sessions do not count as exposure. A
  future scheduled week is used as a planning projection for later weeks, not
  evidence that the athlete completed that dose. The cap is checked in
  `validatePlan` for scheduled runs from the adaptation date onwards and
  re-applied after every adaptation; completed runs are not re-judged.
- *Weekly volume.* For runs the weekly minutes ramp (5%, 2.5% with weak data)
  and the weekly target load limit progression. The extra cycling-style
  scheduled-load ramp is not applied, to avoid shrinking training time as
  low-load walking phases out. This is an engineering choice, not a consequence
  proven by injury research: a null week-to-week distance association does not
  establish that weekly load is irrelevant. When the easy-run load of the available minutes
  exceeds the weekly budget, all sessions are shortened proportionally, so the
  number of running days is kept.
- *Quality caps.* Threshold running is limited to about 10%, interval running to
  8% and repetitions to 5% of scheduled weekly running time, summed
  across all sessions of that family. These are Daniels-inspired coaching caps,
  with time used as a proxy for distance, not validated physiological limits.
  The caps are checked against the current scheduled weekly running time; missed
  and failed sessions do not count toward volume. A completed session cannot be
  changed, so when the rest of a week is missed only scheduled (including
  overdue) hard runs are eased to easy runs, and validation flags an excess only
  while a scheduled hard run contributes to it. Taper volume references a prior
  non-recovery scheduled week and scales partial weeks by the days actually in
  taper. A short final week may omit a hard session rather than compressing one
  into too little time. The planned intensity distribution counts running steps
  up to 88% of threshold speed as easy and above 101% as hard.
- *Strides.* Runners who no longer use run-walk get 4 strides (6 in build,
  specific and peak phases) of 20 s at the end of one easy run per week. Strides
  are never added to hard sessions or the long run.
- *Long run.* About 30% of the weekly time goes to the long run on the chosen
  day, bounded by the spike cap.
- *Strength.* The plan rationale recommends considering progressive strength
  work for running economy, with a conservative introduction and qualified
  guidance for unfamiliar heavy or plyometric exercises. It adds fatigue;
  strength is advice, not scheduled or tracked training.
- *Race readiness.* When the longest planned run stays below 50% of the
  expected race time (declared duration, target finish time, or a Riegel
  prediction from threshold pace and the race distance), the plan flags
  potentially insufficient endurance preparation. This 50% share is a coaching
  heuristic, not trial evidence or a readiness assessment. No warning does not
  certify that the runner is prepared.

**Day to day.** Runs are not played on the trainer: there is no **Start** button
for runs, and the player rejects them. The calendar and session page show a
pace guide per step (for example "threshold 5:06/km, easy 6:15/km") with a
reminder to run by effort on hills, in heat or on trails. **Export ZWO** writes
a running ZWO (`<sportType>run</sportType>`) for watches and apps that accept it.
The export converts threshold-speed targets to the format's 10 km reference pace
using a Riegel estimate; it is unavailable without a threshold pace.
Runs synchronised from Intervals.icu (`Run`, `TrailRun`, `VirtualRun`) or
imported as JSON (`"sport": "running"`, `distance` in metres) are matched only
to running sessions and then adapt the plan as for cycling.

## Architecture and API

This section is for reading or changing the code. A **module** is a focused code
file; an **API** here means the functions other code can call, not an online
server. Pure calculations return results without saving data themselves.
The service coordinates those calculations with storage. The
[beginner's code guide](code-guide.md) explains functions, classes and `async`/`await`.

All calculations use seconds, watts, kilograms, kilometres for goal distances,
metres for goal elevation and minutes for availability and weekly volume.
Activity distance/elevation retain the source input in metres. ISO instants must
include a time-zone offset; calendar dates are `YYYY-MM-DD` in the athlete's
declared IANA time zone. Pure calculations take explicit dates and timestamps.

| Responsibility | Plain-English job | Module / public function |
|---|---|---|
| Activity Normalizer | Put different activity inputs into one checked format. | [normalizer.js](../src/coaching/normalizer.js): `normalizeActivity`, `fromRecordedRide` |
| Running rules | Build run/run-walk steps and convert pace guidance. | [running.js](../src/coaching/running.js): `runSteps`, `runWalkStage`, Riegel helpers, `describeRunPaces` |
| Rider State Estimator | Derive dated estimates from available evidence. | [state.js](../src/coaching/state.js): `estimateState`, `powerDuration`, `estimateCriticalPower`, `intensityDistribution`, `estimateDurability` |
| Goal Demand Model | Describe the types of ability a goal emphasizes. | [demands.js](../src/coaching/demands.js): `modelGoalDemand` |
| Gap Analyzer | Compare supported estimates with goal needs, retaining unknowns. | [demands.js](../src/coaching/demands.js): `analyzeGaps` |
| Periodisation Engine | Divide the plan into phases such as base, build and taper. | [planner.js](../src/coaching/planner.js): `periodise` |
| Weekly Target Generator | Set the allowed training amount for each week. | [planner.js](../src/coaching/planner.js): `weeklyTargets` |
| Workout Progression Engine | Build the prescribed steps for a session and level. | [workouts.js](../src/coaching/workouts.js): `progressWorkout` |
| Library Workout Fitter | Find a suitable recipe and fit it to the allowed time/dose. | [library.js](../src/coaching/library.js): `zwoTemplate`, `coachCatalogue`, `fitWorkout`, `chooseLibraryWorkout`, `prescribeWorkout` |
| Workout Scheduler | Place eligible sessions on available days. | [planner.js](../src/coaching/planner.js): `scheduleWorkouts` |
| Train Now Selector | Choose one ad-hoc session from readiness, load and history without changing the plan. | [train-now.js](../src/coaching/train-now.js): `trainNowWorkout` |
| Workout Matcher | Decide which planned session, if any, an activity supports. | [adaptation.js](../src/coaching/adaptation.js): `matchWorkout` |
| Adaptation Engine | Adjust still-changeable work after new information. | [adaptation.js](../src/coaching/adaptation.js): `adaptPlan` |
| Explanation Engine | Turn decisions into readable reasons. | [explanations.js](../src/coaching/explanations.js) |
| Validation and Safety Guard | Reject data or plans that violate configured limits. | [domain.js](../src/coaching/domain.js) validators and [planner.js](../src/coaching/planner.js): `validatePlan` |

`generatePlan({profile, goal, state, startDate, generatedAt})` composes the pure
planning modules. Goal weights are in the extensible `GOALS` registry; callers
can supply a registry with additional five-element capability weight vectors.
The initial types are general fitness, FTP improvement, gran fondo, climbing,
time trial, road race, criterium, sprint and long-distance completion. Running
goals use the `RUN_GOALS` registry; `profile.sport` (`'cycling'` by default or
`'running'`) selects the registry, session families and safety rules.

`CoachingService(storage, clock, rules)` composes history, snapshots, matching
and revision persistence. `rules` is optional and defaults to `DEFAULTS`;
validated rules are frozen into state snapshots and generated plan metadata.
Mutating methods are asynchronous and must be awaited:
`configure`, `importActivities`, `generate`, `recordRide`, `resolve`,
`updateFeedback`, `advance`, `archive`. `clock` returns an ISO timestamp.
`recordRide` accepts `trainNow: true` from an ad-hoc session: the activity is
added to history, but plan matching and adaptation are skipped.
`resolve` accepts `completed`, `substituted`, `failed`, `missed`, `recovery`,
`feedback` or `unplanned` triggers as appropriate; completed/substituted outcomes
require an actual activity, and a ride cannot satisfy two workouts. Prefer
`updateFeedback` for feedback on an already matched activity.

Browser initialization uses `initializeCoaching()`. `coachingData()` returns
null while initialization is pending; actions require `coachingService()`.
Storage failures are surfaced, not replaced with an empty successful result.

## Decision priority

The Coach applies decisions in this order; a lower item cannot override a
higher one:

1. **Validate inputs and data quality.** Invalid profiles, unsupported goals,
   malformed workouts and incompatible measurements are rejected or marked
   unavailable. Weak history disables hard sessions rather than being treated
   as evidence of fitness.
2. **Apply safety and capacity limits.** Readiness concerns, available days,
   daily/weekly time, load progression, hard-session spacing, power limits and
   demanding-time limits constrain which session families and workout doses
   are eligible.
3. **Choose phase and goal focus.** The date and goal-weighted capability
   priorities select a phase and, when allowed, the highest-priority hard
   capability.
4. **Fit eligible templates to the slot.** Candidates must match the session
   family and pass structural, duration, power and intensity-time checks before
   they are scored.
5. **Minimize dose changes, then use variety as a tie-breaker.** Approved
   cadence practice is an optional exception in endurance slots when its fit
   score is within the configured tolerance. During
   adaptation, preserve the current template if it still fits safely. If no
   template fits, use an explained conservative fallback; if even that cannot
   fit the weekly budget, omit the session.
6. **Validate the complete plan.** `validatePlan` rechecks the schedule and
   raises an explicit error instead of returning an unsafe plan.

## Configuration guide

`DEFAULTS` in `src/coaching/domain.js` is the versioned developer configuration
for historical windows, readiness signals, CP/W-prime fit gates, periodisation,
progression, library fitting and schedule safety limits. `validateCoachingConfig`
merges overrides with defaults and rejects inconsistent ranges. The pure state
API accepts overrides as its fourth argument:

```js
estimateState(activities, profile, asOf, {
    readinessHighRpe: 8,
    progressionSuccessfulSessionsPerLevel: 4,
});
```

`CoachingService(storage, clock, rules)` accepts the same rules object. A
generated plan stores its effective `coachingConfig` and successful-session
baseline so later validation and adaptation use the same decisions. These are
developer-level settings, not athlete-facing recommendations. Changing a
threshold does not make it physiologically valid: thresholds and rule changes
must be reviewed against representative data and independently validated before
use. Do not tune a safety threshold merely to make a plan pass.

## Decision-flow example

For illustration, take a gran-fondo goal with a declared 160 km distance,
2,500 m climbing and a 6-hour expected duration. Its base weights are
endurance 5, threshold 3, aerobic 2, sprint 1 and durability 4. The long-event
and climbing rules add 2 to durability and 2 to threshold, giving weights
`[5, 5, 2, 1, 6]`, normalized by their total of 19. With no explicit FTP or
W/kg target, the threshold gap remains **unknown**; it is not fabricated.

If the plan is in a build phase, history is sufficiently complete, readiness
has no caution signal, and the athlete has room for a hard session, threshold
is the first eligible hard capability in the goal-priority ordering. The
scheduler then allocates an available slot (for example 45 minutes) and
respects the hard-session count and spacing limits. The fitter parses the
threshold templates, rejects any candidate that exceeds its power or demanding
time limits, preserves complete interval repetitions and protected steps, and
compares the remaining templates by the amount of dose adjustment. Variety is
considered only among near-equal fits. The selected steps must sum to exactly
45 minutes; load and weekly constraints are checked before the entire plan is
accepted. If no template fits, the Coach explains its generated fallback or
omits the session if the load budget cannot accommodate it.

## Domain and provenance

| Term | Meaning in this implementation |
|---|---|
| FTP | Athlete-declared functional threshold power; it is not inferred from CP. |
| IF | Normalized power divided by the FTP used for that ride. |
| Power TSS | Duration in hours × IF² × 100; a modelled training-load estimate. |
| CP / W′ | Two-parameter fit `power = CP + W′ / seconds`; CP is watts and W′ is joules. |
| Readiness `caution` | Combined configured subjective signal score reaches its threshold; not a diagnosis. |
| Readiness `monitor` | Subjective signals are present but below the combined caution threshold; they do not reduce training. |
| Progression level | A bounded workout-template dose level earned from successful completed sessions. |
| Hard session | A workout family marked hard by the planner; its count and spacing are independently constrained. |

These terms describe implementation values and are not interchangeable with
clinical measurements or validated laboratory thresholds.

The existing profile's `ftp`, `weight` and `measurement` are reused, rather than
adding another profile UI for equivalent fields. Coaching adds athlete `id`,
experience, time zone, typical/maximum weekly hours, `availableDays`,
`maxSessionMinutes`, `longRideDay`, optional per-day `dayPreferences`,
equipment booleans, and optional maximum/threshold/resting heart rate.
Profiles and goal inputs are frozen into decision snapshots/plan history.

Goals have `id`, `name`, `type`, `date`, priority A/B/C, active state and optional
`distanceKm`, `elevationM`, `expectedDurationMinutes`, `terrain`, `targetPower`,
`targetFTP`, `targetWKg`, `finishTimeMinutes` and `completionObjective`.
Long or mountainous declared demands change capability weights. Explicit FTP
and W/kg targets inform threshold gaps; `targetPower` counts as an FTP target
only for events expected to last 40-70 minutes, because sustainable power for
shorter or longer events is not FTP. There is no fabricated conversion from
terrain or finish time into predicted event power or physiological capacity.

Normalized rides retain source summaries in `original`, an optional
`rawReference`, `source`, `externalId`, `providerIds`, `syncedAt`, stream
availability, quality warnings and a calculation version. Recorded rides are
retained before a Coach profile exists; initial configuration recalculates
history with the declared athlete time zone and FTP where source values are absent.
Load metrics contain value, source, version, confidence, formula and inputs.
Normalized power is either source-supplied/weighted power or explicitly derived
from rolling 30-second averages' fourth powers. Average power is **never**
silently treated as normalized power. A derived normalized power requires
at least 30 contiguous one-second samples covering at least 90% of the ride.
Recorded timestamps with gaps do not become contiguous streams.

* IF = normalized power / FTP used for that ride.
* Power TSS = elapsed duration hours x IF squared x 100.
* Session-RPE load = elapsed duration minutes x RPE (0-10).
* HR load = elapsed minutes x HR-reserve fraction squared, using supplied
  average, resting and maximum HR. This is a labelled HR proxy, **not** TSS or
  clinical TRIMP. Invalid or missing HR-reserve inputs yield unavailable load.
* Work uses supplied kJ, otherwise integrated available power or an explicitly
  labelled average-power/duration estimate.

The load model chooses **one scale for a snapshot**, never a sum of power TSS,
HR load and RPE load. It prefers complete power load, then complete RPE load,
then complete HR load, otherwise duration minutes. Missing older values on the
selected scale are flagged. Load values from snapshots with different scales
are not directly comparable. Planned power-load points are normalized-power TSS forecasts from ideal
execution of the interval steps, not measured load, and are labelled separately.
They use the same rolling-power calculation as actual streams, including
interval transitions; a simple mean of squared interval powers would
underestimate variable-intensity load.

Data levels: A = power/HR streams plus RPE; B = summary power/HR plus RPE;
C = HR plus RPE; D = duration plus RPE; E = duration only or incomplete richer
inputs. Actual available metrics are retained even when feedback is missing.
Weak inputs never acquire fabricated power or capability values.

## Defaults and limits

These are the program's starting settings, not universal recommendations for
athletes. A limit can make the program more conservative without being a
scientifically proven safe boundary. "Unavailable" is a valid result when
there is not enough evidence.

Defaults are versioned in `domain.js`, not universal physiological laws.
Historical windows, time constants, readiness limits, CP/W-prime fit gates,
progression criteria, library dose limits and schedule caps can be supplied to
`estimateState` or `CoachingService` through their rules/configuration argument.
All defaults are initial engineering heuristics, not scientifically validated
athlete-specific thresholds.
Configuration validation also requires the caution threshold to exceed the
sleep-only score, so sleep quality cannot independently trigger a readiness
caution.

| Setting | Initial value / rule |
|---|---|
| Short / medium / long history | 7 / 28 / 84 days |
| Chronic / acute exponential time constants | 42 / 7 days; daily coefficient `1 - exp(-1 / days)` |
| Weekly metrics / ramp-rate difference | Last 7 days / chronic-load difference over 7 days |
| Recent subjective concerns | Configured 3-day window |
| Sleep-quality signal | One point toward the default three-point caution threshold; never an isolated verdict |
| Other subjective signals | High RPE adds 3 points; low leg freshness and high soreness add 2 each; high stress adds 1. Soreness 5/5 or leg freshness 1/5 scores 3 alone (caution); extreme soreness also prompts a pain report |
| Supported-data threshold | At least 8 medium-window sessions in the coached sport, spread over at least 3 different weeks, at least half with power/pace intensity, heart rate or RPE (no particular sensor required); medium confidence additionally needs data level A or B for every session |
| Return to training (`returnToTraining*`) | After >=14 days without the coached sport: 50% / 75% of the planned weekly dose for breaks up to 28 days, otherwise 33% / 50% / 75%, over as many days as the break (max 63); no hard sessions below 75% |
| Interval evidence (`intervalEvidence*`) | Interval summary, or a 3 s smoothed power stream >=90% of the lowest hard target for >=85% of planned hard time |
| Weekly volume/load growth ceiling | 5%; 2.5% with weaker data |
| Growth reference | Maximum scheduled volume/load in preceding four weeks, with absolute availability caps |
| Initial duration | No greater than typical/maximum hours, day capacity, medium-window weekly average and recent weekly duration |
| No history / recent inactivity | At most 90 initial minutes, further bounded by history and availability |
| Insufficient (low-confidence) history | Never starts below the no-history 90 minutes; a single short test ride cannot shrink the plan |
| Initial power-load envelope | Also bounded by observed recent and medium-window average power load, when on a power scale and the data level is sufficient |
| Recovery | Every fourth training week, 70% of the preceding envelope; skipped when it would fall directly before the taper |
| Taper | 55% of the envelope; 14 / 7 / 3 days before an A / B / C goal, at most 25% of the plan; keeps one short quality session per taper week when the plan lasts at least 21 days and the session is at least 3 days before the event |
| Hard sessions | At most 2/week (1 for beginners), none with weak data or recovery concerns; the focus rotates between the goal's two highest-priority capabilities |
| Hard-session separation | At least one easy/rest day |
| Demanding interval time | Library template <=18% of its slot; full plan <=20% of weekly time |
| Minimum useful session | 10 minutes; shorter or overloaded sessions are omitted with warnings |
| Subjective recovery reduction | 30% for non-sleep caution signals |
| Missed/failed/low-quality outcome reduction | 15% |
| Short-term adaptation window (`adaptationWindowDays`) | 7 days; reductions apply only inside it, are held until it ends and never change later sessions |
| High-RPE readiness signal (`readinessRpeMargin`) | RPE at or above `min(10, planned expected RPE + 2)` when the matched session has an expected RPE; otherwise at or above `readinessHighRpe` (9 by default). The margin defaults to 2 |
| Workout progression | One level per 3 successful sessions in that family, only within unused load budget |
| CP fit | At least 3 explicit maximal efforts, 120-1200 s, >=3:1 span, R-squared >=0.95 |
| CP plausibility gate | 50-600 W CP and 1-50 kJ W-prime |

Recovery re-entry may return to a previously scheduled envelope, not jump beyond
the four-week envelope plus its growth ceiling. Recovery is not allowed to
compound into permanent volume decay. Both duration **and** step-based load are
validated; intensity progression cannot bypass the load ceiling.

Short lead times under 21 days use preparation and taper rather than compressing
build training. Other plans use assessment when data is weak, base, build,
specificity, peak, recovery, taper and event phases as time permits. The event
day is represented but not prescribed as another training session. There are no
guaranteed target FTP gains, finish times or inferred readiness-to-race claims.

Workout families cover recovery, endurance, durability, threshold, aerobic and
sprint work. Progression levels are earned from successful outcomes, not
scheduled-workout counts; a next-level dose is used only when it fits the
remaining weekly load budget. Complete interval repetitions and any
template-designated warm-up/recovery/cool-down steps are preserved. The
scheduler respects availability, long-ride preference, per-day duration and
hard-session spacing. Unschedulable targets are reduced and explained, never
forced into another day.

## Scientific review

The planning methods were checked against the training-science literature. The
table lists each method, the evidence, the verdict and what changed. "Aligned"
means a broad principle is consistent with evidence, not that this planner or
its exact thresholds have been validated. No single intensity distribution or
periodisation is optimal for every athlete. Many studies involve trained
athletes, so transfer to beginners and very long races is uncertain.
Defaults remain engineering heuristics.

| Method | Evidence | Verdict | Change |
|---|---|---|---|
| Phases and mostly easy volume | [Seiler 2010](https://pubmed.ncbi.nlm.nih.gov/20861519/); [Stöggl & Sperlich 2014](https://pubmed.ncbi.nlm.nih.gov/24550842/); [Rosenblat 2019](https://pubmed.ncbi.nlm.nih.gov/29863593/); [Casado 2022](https://pubmed.ncbi.nlm.nih.gov/35418513/); [Filipas 2022](https://pubmed.ncbi.nlm.nih.gov/34792817/): support for substantial easy training; pyramidal and polarized approaches can both work | Broadly aligned; exact phase lengths and distribution are not established | Retained |
| Hard sessions capped and separated; hard-time share <=20% | [Seiler 2010](https://pubmed.ncbi.nlm.nih.gov/20861519/); [Burnley et al. 2022](https://pubmed.ncbi.nlm.nih.gov/35135998/) challenge universal polarized superiority | Reasonable guardrails, not proof of an optimal dose. Time-in-zone, session counts and threshold definitions are not interchangeable | Retained; do not label the engine a validated "80/20" programme |
| One fixed hard focus per goal | [Rønnestad 2014](https://pubmed.ncbi.nlm.nih.gov/22646668/), [another cycling trial](https://pubmed.ncbi.nlm.nih.gov/23134196/) and [Mølmen 2019](https://pubmed.ncbi.nlm.nih.gov/31802956/) examine block training; [Milanović 2015](https://pubmed.ncbi.nlm.nih.gov/26243014/) finds VO2max improvements with both continuous training and HIIT | Broader stimuli are reasonable; these studies do not validate this rotation algorithm or make HIIT necessary for every athlete | Rotate between the goal's two highest-priority hard capabilities |
| Taper: 55% volume, formerly 7 / 4 / 2 days with recovery only | [Bosquet 2007](https://pubmed.ncbi.nlm.nih.gov/17762369/): 27-study meta-analysis favours about 2 weeks, progressive 41-60% volume reduction, intensity/frequency maintained; [Mujika & Padilla 2003](https://pubmed.ncbi.nlm.nih.gov/12840640/); [Spilsbury 2015](https://pubmed.ncbi.nlm.nih.gov/25189116/); [Smyth & Lawlor 2021](https://pubmed.ncbi.nlm.nih.gov/34651125/) | Volume broadly aligned; taper length and loss of intensity needed attention | 14 / 7 / 3 days for A / B / C goals, capped at 25% of plan length; allow one quality session per taper week when readiness, history and availability permit. B/C lengths remain heuristics |
| Recovery week every fourth week | [Sandbakk et al. 2025](https://pubmed.ncbi.nlm.nih.gov/40278987/) describe world-class coaches' practice, not a trial establishing a universal deload interval | Coaching heuristic | Avoid stacking a routine deload immediately before taper; this is not a claim that stacked reductions necessarily cause detraining |
| CTL/ATL-like exponential averages and session RPE | [Morton, Fitz-Clarke & Banister 1990](https://pubmed.ncbi.nlm.nih.gov/2246166/); [Foster 1998](https://pubmed.ncbi.nlm.nih.gov/9662690/), [2001](https://pubmed.ncbi.nlm.nih.gov/11708692/) | Consistent with load modelling; fixed 42/7-day constants do not measure biological fitness/fatigue or predict individual injury | Retained as labelled indicators, not calibrated performance predictions |
| Weekly ramp 5% (2.5% with weak data) | [Impellizzeri 2020](https://pubmed.ncbi.nlm.nih.gov/32502973/) critiques causal ACWR claims; [Buist 2008](https://pubmed.ncbi.nlm.nih.gov/17940147/) found no injury reduction from a graded programme based on the weekly 10% rule | Conservative heuristic, not a proven safe threshold | Running retains minutes ramp and target load, without a second scheduled-load ramp |
| Readiness from subjective feedback | [Saw 2016](https://pubmed.ncbi.nlm.nih.gov/26423706/): subjective measures often respond more consistently to training load than common objective markers | Monitoring principle supported; this scoring algorithm is unvalidated | Retained; no isolated sleep verdict or diagnosis |
| Running injury risk | [Nielsen 2014](https://pubmed.ncbi.nlm.nih.gov/25155475/); [Damsted 2018](https://pubmed.ncbi.nlm.nih.gov/30534459/); [Frandsen 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12421110/): 5,205-runner cohort; single-session **distance** spikes >10-30%, >30-100% and >100% associated with HRRs 1.64, 1.52 and 2.28; no week-to-week distance-ratio association | Observational association, not proof of causation or a safe limit; duration is an unvalidated proxy | Duration-based spike guardrail in planning, validation and adaptation, with limitations disclosed |
| Run-walk and novice progression | [Hottenrott 2016](https://pubmed.ncbi.nlm.nih.gov/25467199/): 42 non-elite marathon runners, similar finish times and less reported muscle pain/fatigue with run-walk, but no reduced cardiovascular load; [Videbæk 2015](https://pubmed.ncbi.nlm.nih.gov/25951917/) examines injury incidence | Does not establish reduced muscle damage/injury or validate these novice stages | Heuristic staged run-walk and a four-day beginner cap |
| Quality-session limits | Daniels' coaching framework uses threshold/interval/repetition work and volume-based dose limits; this implementation substitutes time for mileage | Coaching convention, not independently trial-validated percentages | Aggregate weekly family caps of 10% / 8% / 5%; rechecked after adaptation |
| Race prediction / threshold pace | Riegel's endurance model; [Vickers & Vertosick 2016](https://pubmed.ncbi.nlm.nih.gov/27570626/) find optimistic marathon estimates in recreational runners | Approximate one-hour race pace is not a measured lactate threshold or critical speed | Exponent 1.06, direct pace input or race estimate, and a heuristic preparation warning |
| Strength training | [Balsalobre-Fernández 2016](https://pubmed.ncbi.nlm.nih.gov/26694507/); [Blagrove 2018](https://pubmed.ncbi.nlm.nih.gov/29249083/); [Rønnestad & Mujika 2014](https://pubmed.ncbi.nlm.nih.gov/23914932/) | Evidence supports running-economy benefits; individual dose, experience and recovery still matter | Optional progressive-strength advice, not scheduled sessions |
| Power/HR/pace zones | [Burnley et al. 2022](https://pubmed.ncbi.nlm.nih.gov/35135998/) discuss problems with classifying intensity and claims of polarized superiority | Fixed percentages are not measured physiological thresholds; FTP, critical power and lactate/ventilatory thresholds are not interchangeable | Keep zone estimates labelled; suggest individual calibration |

### Suggested further adaptations (not implemented)

These are lower-confidence changes or need more data or user interface work:

- **Intensity in base for time-crunched athletes.** Evaluate an optional modest
  quality session for experienced, recovered athletes with limited weekly time,
  rather than assuming an easy-only base is always optimal. Do not apply it
  automatically to beginners or weak-history profiles.
- **Threshold-based heart-rate zones.** Use lactate threshold heart rate (LTHR)
  instead of percentages of maximum heart rate, and use heart rate as the load
  source (Banister TRIMP) when power and pace are missing.
- **Monotony and strain** (Foster 1998) as an extra readiness signal.
- **Data level for power-only or pace-only users.** These users can now receive
  hard sessions once their history is sufficient, but cannot reach data level
  A/B without heart rate and RPE, which keeps the weekly ramp at the low-data rate.
- **Progressive intensity distribution.** Evaluate pyramidal-to-polarized
  progression rather than treating the fixed `targetIntensityDistribution` as
  optimal. Filipas supports this in well-trained male runners, not all athletes.
- **Progressive taper.** A progressive (non-linear) taper performed slightly
  better than a step taper in Bosquet 2007.
- **Running-specific improvements.** Use distance (not duration) for the spike
  cap, grade-adjusted pace for load, and dated longest-run history so the
  30-day window is exact. Avoid long runs directly after interval days for
  intermediate runners.
- **Validate the race-readiness heuristic** against real training outcomes.

## Estimation limitations

The load model initializes at zero over the supplied history. Missing imported
rides cannot be distinguished from rest, and CTL-like, ATL-like and form-balance
values are **modelled load indicators**, not direct biological measurements.
No history produces unavailable load estimates with low confidence.

Power-duration values are rolling observed bests at 5/15/30/60/180/300/720/
1200/1800/2400/3600 seconds, with watts, W/kg, date and context. Recent and longer
baselines are stored separately. An absent recent maximal effort is never
interpreted as a decline. Stream-derived bests do not declare themselves maximal.

The versioned CP fit uses least-squares `power = CP + W-prime / seconds`.
Its default gates require three explicitly maximal efforts with distinct
durations from 120-1200 seconds spanning at least 3:1. Fits need R-squared
>=0.95, CP 50-600 W and W-prime 1-50 kJ. These initial plausibility gates can
reject unusual athletes; unavailable is preferable to a fabricated fit. The
gates are configurable but have not been independently validated for every
athlete population. FTP remains separate from CP. MAP is unavailable without a
validated assessment protocol.

Power and HR zone seconds remain separate, with reference, thresholds and
version. Default power thresholds are 55/75/90/105/120/150% FTP; default HR
thresholds are 60/70/80/90% declared maximum HR. Three-zone summaries use
75/105% FTP and 70/90% maximum HR respectively. These are labelled heuristics,
not measured lactate/ventilatory thresholds. Summary-only rides cannot supply
time-in-zone distributions.

Durability observations require at least 60 minutes of paired one-second
power/HR data, discard the first 10 minutes, require steady 50-75% FTP power
(coefficient of variation <=10%) and valid HR. Power fade and HR/power decoupling
compare the remaining halves. Best-effort context records observations after
60 minutes. Unavailable data returns null with a reason; these measures do not
diagnose fatigue, illness or injury.

## Adaptation and persistence

Successful outcomes can earn a later progression after the configured number
of sufficiently well-matched completed/substituted sessions in that family;
the change is only made when weekly load headroom permits it. Failure, low
completion quality, missed work and non-sleep subjective caution signals reduce
future prescriptions. Poor sleep alone is monitoring only. Large unplanned
rides consume the week's remaining load budget. Later substitution/feedback
does not count the same ride's load twice. Completed and past-dated workout
prescriptions remain unchanged; future workouts retain their stable identifiers
when modified. There are no catch-up sessions or automatic FTP increases, and
missing maximal efforts never earn progression.

Short-term reductions are bounded in time and structure:

* Reductions (caution, missed, failed or low-quality outcomes) only change
  sessions inside the next `adaptationWindowDays` (7). Sessions after the
  window keep their exact planned family, duration and steps. Every reduced
  future workout keeps an `original` snapshot recording the planned dose, the
  window end (`until`), the reduction factor and whether it was made easy.
* A reduction is held until its window ends. A later, less cautious event
  inside that window (feedback, a missed session after "Make upcoming training
  easier", a good completion) cannot lengthen or harden a held session. A
  stricter event (lower factor, or easy when the held session was not) can
  still tighten it, and the window then moves to the new end date.
* Reduced sessions from plans adapted before windows were recorded (an
  `original` without `until`) are restored to their planned dose by the next
  adaptation, with the note "Restored to the planned session after the
  short-term adjustment ended."
* Missed or failed sessions shorten nearby sessions within the same workout
  family; they do not convert the plan to recovery rides. Only a readiness
  caution or the "Make upcoming training easier" action lowers intensity.
* When a week cap must shrink, the reduction is shared proportionally across
  that week's sessions. The adapter first shortens a session within its
  planned family (5-minute steps, never below the 10-minute minimum) and only
  falls back to a recovery ride if no in-family dose fits.
* The ramp envelope is seeded with the plan's initial limits. Each week stores
  its validated planned dose (`plannedMinutes`, `plannedLoad`). The growth
  ceiling uses the larger of the scheduled and planned dose of earlier weeks
  (`rampReference`, clamped to the week's targets), so a short-term cut does
  not lower the cap of later weeks. A week still never exceeds its own
  original dose, and no catch-up is added.

Every adaptation records its trigger, old/new revisions, source snapshot,
observations, added/removed/moved/modified/resolved workouts as applicable, load
change, deterministic reason, validation warnings, version and timestamp.
Resolved outcomes update completion/success statistics in the new snapshot.
Repeated imports, recordings and identical feedback are idempotent.

The dedicated `too-many-watts-coaching` IndexedDB database stores the complete coaching
bundle in an atomic transaction: normalized history, versioned snapshots,
complete plan revisions and adaptation records. It is independent of the
seven-ride FIT cache and does not inherit localStorage's small quota.
Transactions resolve only after commit; a failed write preserves the previous
in-memory revision and reports an error. Concurrent-tab writes are rejected
instead of silently overwriting history. The UI can export the complete bundle
as JSON for inspection; raw JSON rides can be imported. Settings > Local backup
downloads and restores the entire coaching bundle together with device data.

Storage is browser-local and browser quotas/eviction still apply.
Export a backup before clearing site data. There is no automatic synchronization
between browsers, devices or old server accounts.

## Adding a workout template

1. Append a well-formed ZWO string to `src/workouts/workouts.js`; do not
   reorder existing templates because their built-in IDs are index based.
2. Use elements the fitter understands: `Warmup`, `Cooldown`, `Ramp`,
   `SteadyState`, and `IntervalsT`. Avoid `FreeRide` and tests
   for Coach-eligible templates. Power values are FTP fractions.
3. Ensure interval work is represented as complete on/off repetitions.
   Warm-up, interval recovery and cool-down are protected when parsed; the
   fitter removes only complete repetitions and trims only unprotected easy
   riding. Its default minimum is two repetitions (or all repetitions if the
   template has fewer). Optional `Cadence` and `CadenceResting` targets are
   retained through fitting, playback and export; missing cadence is not
   replaced by an invented target.
4. Add or verify its category-to-family mapping in
   `src/coaching/library.js` (`CATEGORY_FAMILIES`). For a template requiring
   stricter minimums, add `minimumEfforts`, `minimumWarmupSeconds` and/or
   `minimumCooldownSeconds` to `TEMPLATE_RULES`, keyed by the exact template
   name. A template with missing structure or out-of-range power is rejected.
   Technique sessions are excluded unless explicitly reviewed and added to
   `TECHNIQUE_TEMPLATES`; do not approve a session solely because its category
   is Technique. Its cadence steps must be suitable for gentle endurance
   practice and are protected from shortening or repetition removal.
5. Add parser, minimum-dose, exact-duration, power-limit and hard-time-share
   tests to `test/coaching/library.test.js`. Run that test file and the broader
   coaching suite before using the template in plans.

### Recently added library workouts

The library includes three additional long aerobic options (2h, 2h45 and
3h15), a 2x20 tempo session, a 4x8 sweet-spot session, a 3x8 threshold
template and a 4x4 VO2 session. The Coach can reduce interval repetitions to
stay within the configured hard-time limit. The long rides stay within the configured
endurance power ceiling and include reminders to pace and fuel them sensibly.
These are original Too Many Watts templates informed by established workout formats,
not copied workout files or guarantees of a particular adaptation.

References consulted:

* [Seiler et al., "Adaptations to aerobic interval training: interactive
  effects of exercise intensity and total work duration"](https://pubmed.ncbi.nlm.nih.gov/21812820/)
  (peer-reviewed study; informs interval duration/structure, not a universal
  power prescription).
* [British Cycling indoor training sessions](https://www.britishcycling.org.uk/knowledge/skills/article/izn20150901-Indoor-Training-Sessions-0)
  (examples of structured indoor session design).
* [TrainerRoad sweet spot training overview](https://www.trainerroad.com/blog/sweet-spot-training-everything-you-need-to-know/)
  (practical context for sweet-spot intensity).

The Coach still selects and fits templates against each rider's available
time, family, progression level, safety limits and load budget. A listed
2-hour-or-longer template is not automatically prescribed at full length; the
planned dose and the rider's current constraints take priority.

### Cadence practice

The original Cadence Foundations 30, Cadence Control 40 and Cadence Endurance 50
templates alternate moderate cadence targets at easy power, with warm-up and
cool-down. They are inspired by the general practice of varying cadence on easy
rides, not copies of a specific workout. [TrainerRoad's cadence overview](https://www.trainerroad.com/blog/whats-the-most-efficient-cycling-cadence-and-how-cadence-drills-can-make-you-faster/)
discusses individual and situational variation; its benefit claims should not be
interpreted as proof that any particular drill is necessary or effective for a
given rider.

The Coach explicitly opts in only those three built-in templates, never the
older, more demanding Cadence Drills. They are eligible only in endurance slots
in assessment, base or build phases, not recovery, taper, hard or long-ride
slots. Caution readiness schedules recovery instead. By default, new selections
are at least seven days apart (`libraryTechniqueSeparationDays`), and their
fitting score must be within 0.15 (`libraryTechniqueFitTolerance`) of the best
eligible template. Existing time, power, intensity and weekly load constraints
still apply. Adaptation can retain an already selected drill when it still fits,
but does not introduce new technique sessions, and forced-easy adaptations do
not use them. The cadence-targeted intervals, including recoveries, are never
trimmed or removed; if they do not fit, another session is chosen.

This is optional practice, not evidence that the rider has a cadence deficiency
or a prescribed optimal cadence. Library cards show the target range and
whether other parts are self-selected; details show each target. Keep the pedal
stroke relaxed, choose a comfortable cadence if bouncing or uncomfortable, and
stop for pain. Coaching support does not diagnose illness or injury.

## Adding a readiness rule

1. Add its threshold to `DEFAULTS` in `src/coaching/domain.js` and validate its
   range in `validateCoachingConfig`; do not add an unvalidated magic number to
   the planner.
2. Add the observation and reason to the readiness classification in
   `src/coaching/state.js`. Keep missing values explicitly unavailable. Sleep
   and any future HRV signal are context only unless corroborated by a distinct
   non-sleep signal; no one consumer metric is a verdict.
3. Decide explicitly whether the rule is `monitor` or `caution`. Only readiness
   status `caution` reduces training or suppresses hard sessions based on
   readiness; missed/failed outcomes have their own adaptation rules. Do not
   diagnose illness or injury.
4. Add tests for missing data, a single signal, corroborating signals,
   configured threshold overrides and the resulting plan/adaptation.
5. Document the rationale and limitations, and have the threshold reviewed
   against representative data by qualified domain experts before deployment.
   Passing software tests is not physiological validation.

## Verification

These commands are for contributors, not a requirement before using the Coach.
They run automated examples, including deliberately invalid inputs and failed
storage writes. A passing software test does not validate a physiological
prediction. See [reading and running tests](code-guide.md#reading-and-running-tests)
for the terminology.

```sh
npm test -- --runInBand test/coaching test/views/training-calendar.test.js test/platform/plan-view.test.js
npm test -- --runInBand   # full suite, including IndexedDB, service-worker and backup tests
npm run build
```

Tests cover exact load formulas and provenance, all data levels, rolling best
powers, synthetic known CP/W-prime, rejected fits, configurable windows,
separate zones, suitable/unsuitable durability inputs, every initial goal type,
availability/date matrices, initial and progressive load bounds, periodisation
and recovery re-entry, structured player/ZWO compatibility, matching,
future-only adaptation, immutable revision history, duplicate events, failed
persistence, IndexedDB restoration/conflicts, and the calendar form workflow.
`test/coaching/running.test.js` covers every running goal, the spike cap,
run-walk and its completion-based stage ceiling, strides, the race-readiness
warning, pace load, Riegel estimates, run ZWO export, run-only matching, overdue
sessions not counting as exposure, quality caps after a missed rest of week, and
a completed long run staying valid when an earlier run is marked missed.
Planning and metrics tests cover staged return to training, sensor-independent
data sufficiency, extreme soreness/leg-fatigue caution, preserved generation
warnings, stream-based interval evidence, completed rides staying valid when
earlier rides are marked missed, overdue sessions using the weekly budget and
legacy cycling plans without a stored longest-session reference.

### Threshold validation with representative data

The figures below are previously recorded development checks, not a fresh
measurement from this documentation update or a guarantee for another setup.

The defaults were exercised with synthetic rider archetypes (beginner with RPE
only, intermediate, advanced, time-crunched, returning, no history) across all
goal types and lead times: 162 plans, all valid and non-empty. Readiness was
simulated over 26 weeks for normal, hard-block, life-stress and fatigued
riders; after comparing high RPE with the planned effort, false caution rates
fell (normal 13% to 10%, hard block 38% to 31%, life stress 35% to 28%) while
the fatigued rider was still flagged on 82% of days. A single caution used to
keep only about 68% of the remaining planned volume because every future
session was downgraded. Across 90 adaptation dates of a 26-week plan, a
caution now keeps 97.1% of the remaining planned volume (69% inside the 7-day
window) and a missed session keeps 98.5% (84% inside the window). No session
outside the window changed, and every adapted plan passed `validatePlan`.

The coached workflow was also tested end-to-end in the browser: plan creation,
starting today's session from the calendar, step targets matching
`prescribeWorkout`, skipping intervals, finishing and saving the ride, and the
resulting adaptation (families preserved, only in-window sessions shortened).

These simulations use synthetic data. They check software behaviour and
plausibility; they are **not** physiological validation of the thresholds.

### Known limitations

* With little or no history the plan starts at about 90 minutes per week split
  into short sessions, even with more availability, and grows only by the
  low-data ramp. Archive and regenerate the plan once enough rides are recorded.
* The per-session hard-time cap (18%) means threshold days use sweet-spot style
  sessions; true threshold/VO2 blocks would need a weekly hard-time budget.
* Planned recovery weeks contain recovery-family sessions only; taper weeks
  keep one short quality session when the plan is long enough.
* Running load uses average pace, not grade-adjusted pace, so hills, trails,
  stops and interval structure can distort the score; planned running load uses
  a different interval-weighted proxy. Neither is a validated injury measure.
  The spike cap uses duration rather than distance; the
  ZWO `pace="2"` mapping (10 km pace) only approximates threshold pace; and
  Riegel predictions are optimistic for the marathon.
* Beginner running plans grow slowly (about 2 minutes per week from 90
  minutes) and may not be enough for a long race; the readiness warning flags
  this.
* Stream-based interval evidence is a heuristic (90% of the lowest hard target
  for 85% of planned hard time); outdoor surges can count toward it. Hard runs
  progress only with an Intervals.icu interval summary.
* Duration from other sports is shown in the explanation but is not added to
  the planned sport's load or spike cap; subjective feedback from those
  activities still affects readiness.
* Small leftover budget can produce 10-20 minute filler sessions.
* A very short recorded ride matched to today's session counts as a
  low-quality completion and triggers the 15% short-term reduction.
* The installed PWA service worker can serve outdated bundles during
  development; unregister it and clear its app-file cache before manual testing.
  Do not confuse that cache with training-data storage: clearing all site data
  can remove your rides and plans, so export a backup first.
