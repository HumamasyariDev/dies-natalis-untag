# Angle Smoothing Design

**Date:** 2026-05-23
**Status:** Approved
**Sprint:** 17 (per roadmap in `documentation/mediapipe-pose-spec.md` future list)

## Problem

Joint angles computed by `AngleCalculator` exhibit visible jitter even though
the underlying pose keypoints are already passed through a 1-Euro filter.
Small residual noise in keypoint positions is amplified by `arccos` when
angles approach extremes (especially near 180°, full extension). The
existing `angles.smoothing` config flag is a no-op placeholder.

## Goal

Add a temporal filter on the per-frame angle stream so consumers
(UI overlay, storage, API) see a smooth signal without losing
responsiveness to fast motion.

## Non-Goals

- Smoothing angular velocity or acceleration (deferred to Sprint 18).
- Different smoother per joint family.
- Smoothing across coordinate-system switches.
- Adding a new filter algorithm — reuse the existing `OneEuroFilter`.

## Design

### Algorithm

Reuse `OneEuroFilter` from `client/js/filterPipeline.js`. The pose keypoints
use it already; using the same algorithm on angles keeps system behavior
coherent. Adaptive: less smoothing during fast motion, more at rest.

### New class: `AngleSmoother`

Lives inside `client/js/angleCalculator.js`. Internal to the module — not
exported as a public API.

Owns:

- `filters: Map<string, OneEuroFilter>` — one filter instance per joint
  name, lazy-created on first valid reading.
- `config: { enabled, minCutoff, beta, dCutoff }`.

Methods:

- `smooth(angles, timestamp)` — given `{joint: number|null}`, returns the
  same shape with filtered numbers. For each joint:
  - If `value` is a number: lazy-create the filter if needed, run
    `filter.filter(value, timestamp)`, return result.
  - If `value` is `null`: reset that joint's filter, return `null`.
    Prevents the next valid reading from snapping through stale state.
- `updateConfig(newConfig)` — calls `OneEuroFilter.updateParams()` on each
  existing filter. Toggling `enabled: false` causes `smooth()` to pass
  through raw values. Toggling back on: filters lazy-create fresh on next
  valid reading.
- `reset()` — clears the filter map.

### Integration

`AngleCalculator.onPoseDetected()`:

1. `calculateJointAngles(poseData, config)` — unchanged.
2. If `this.smoother` is present and enabled, run angles through it
   using `poseData.timestamp`.
3. Emit `angles:calculated` with `{timestamp, angles}` — payload shape
   unchanged. Consumers don't notice.

`AngleCalculator.updateConfig()` forwards smoothing config to the smoother.

### Config shape

Backwards compatible. Two forms accepted:

Scalar (existing):

```yaml
angles:
  smoothing: true   # or false
```

Parsed to `{ enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 }` —
all defaults.

Object (new):

```yaml
angles:
  smoothing:
    enabled: true
    minCutoff: 1.0   # Hz — lower = more smoothing at rest
    beta: 0.05       # higher = faster response to motion
    dCutoff: 1.0
```

The `beta` default of 0.05 is intentionally higher than the keypoint
pipeline's 0.007. Angles change much faster than positions per frame
(arccos amplification), so the filter needs to react quicker to motion to
avoid feeling laggy.

### Hot-reload

Existing config-change subscription in `AngleCalculator` already calls
`updateConfig()`. No new plumbing needed — the smoother piggy-backs on it.

## Tests (~8 new, in `tests/angleCalculator.test.js`)

1. Smoothing applied when `enabled: true`.
2. Bypass when `enabled: false`.
3. `null` input resets that joint's filter and passes through as `null`.
4. Constant input → output converges to input (within tolerance).
5. Step input (45° → 135°) → output transitions smoothly, no overshoot,
   converges within N frames.
6. Per-joint isolation — pushing values into `left_elbow` doesn't move
   `right_knee`.
7. `updateConfig()` mid-stream changes filter behavior live.
8. Backwards compat: scalar `smoothing: true` parsed as enabled with
   defaults; `smoothing: false` parsed as disabled.

## Files touched

1. `client/js/angleCalculator.js` — add `AngleSmoother` class, instantiate
   in `AngleCalculator` constructor, wire into `onPoseDetected`, forward
   in `updateConfig`.
2. `client/js/filterPipeline.js` — already exports `OneEuroFilter`. No
   change.
3. `config/config.yaml` — change `smoothing: false` to the object form
   with defaults.
4. `config/config.example.yaml` — same.
5. `tests/angleCalculator.test.js` — add the 8 tests above.
6. `documentation/mediapipe-pose-DEVLOG.md` — Sprint 17 entry.

## Risks

- **Default tuning.** `beta: 0.05` is a guess based on the keypoint
  pipeline's 0.007 scaled for angle dynamics. May need adjustment after
  visual testing in-browser. Mitigated by config hot-reload — tune live.
- **Visibility flicker.** If a joint flickers in/out of visibility every
  few frames, repeated filter resets degrade smoothing. Acceptable: the
  alternative (carrying stale state across gaps) is worse.
- **Test of step response uses arbitrary tolerance.** Tests assert
  "converges within N frames to within X°" — N and X are chosen by hand.
  Documented in test comments.
