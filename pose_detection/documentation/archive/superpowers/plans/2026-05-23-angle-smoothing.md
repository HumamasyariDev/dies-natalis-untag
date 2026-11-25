# Angle Smoothing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-joint temporal smoothing to `AngleCalculator` output using the existing `OneEuroFilter`, configurable via `angles.smoothing` (backwards compatible with the current boolean flag).

**Architecture:** New internal `AngleSmoother` class inside [client/js/angleCalculator.js](client/js/angleCalculator.js). Owns a `Map<jointName, OneEuroFilter>` (lazy-created per joint). `AngleCalculator.onPoseDetected()` runs raw angles through the smoother before emitting `angles:calculated`. Null values reset that joint's filter and pass through. Config supports both scalar (`smoothing: true|false`) and object forms.

**Tech Stack:** ES modules, Vitest, existing `OneEuroFilter` from [client/js/filterPipeline.js](client/js/filterPipeline.js).

**Spec:** [docs/superpowers/specs/2026-05-23-angle-smoothing-design.md](docs/superpowers/specs/2026-05-23-angle-smoothing-design.md)

---

## File Map

- **Modify** [client/js/angleCalculator.js](client/js/angleCalculator.js) — add `AngleSmoother` class + `normalizeSmoothingConfig` helper, instantiate in `AngleCalculator` constructor, wire into `onPoseDetected()`, forward in `updateConfig()`.
- **Modify** [client/js/filterPipeline.js](client/js/filterPipeline.js) — no code change. Already exports `OneEuroFilter`. Verified.
- **Modify** [config/config.yaml](config/config.yaml) and [config/config.example.yaml](config/config.example.yaml) — change scalar `smoothing: false` to the object form with sensible defaults.
- **Modify** [tests/angleCalculator.test.js](tests/angleCalculator.test.js) — add `describe('AngleSmoother')` and `describe('AngleCalculator smoothing integration')` blocks (~8 tests).
- **Modify** [documentation/mediapipe-pose-DEVLOG.md](documentation/mediapipe-pose-DEVLOG.md) — append Sprint 17 entry.

No new files. The smoother is internal to `angleCalculator.js` because it has one consumer.

---

## Task 1: Smoothing config normalizer

**Files:**
- Modify: `client/js/angleCalculator.js` (top of file, before `AngleCalculator` class)
- Test: `tests/angleCalculator.test.js`

This helper accepts both scalar and object forms of `angles.smoothing` and returns a canonical `{enabled, minCutoff, beta, dCutoff}` object. Lets every downstream component assume one shape.

- [ ] **Step 1: Write the failing tests**

In `tests/angleCalculator.test.js`, add a new top-level import line and a new `describe` block at the end of the file (after the existing `describe('AngleCalculator')`):

```javascript
// Add to imports at top of file:
import { calculateAngle, calculateJointAngles, AngleCalculator, JOINT_ANGLES, AngleSmoother, normalizeSmoothingConfig } from '../client/js/angleCalculator.js';

// Add at end of file:
describe('normalizeSmoothingConfig', () => {
  it('returns disabled defaults when input is undefined', () => {
    const cfg = normalizeSmoothingConfig(undefined);
    expect(cfg).toEqual({ enabled: false, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 });
  });

  it('returns disabled defaults when input is false', () => {
    const cfg = normalizeSmoothingConfig(false);
    expect(cfg.enabled).toBe(false);
    expect(cfg.minCutoff).toBe(1.0);
    expect(cfg.beta).toBe(0.05);
    expect(cfg.dCutoff).toBe(1.0);
  });

  it('returns enabled defaults when input is true', () => {
    const cfg = normalizeSmoothingConfig(true);
    expect(cfg).toEqual({ enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 });
  });

  it('passes through object form, filling missing fields with defaults', () => {
    const cfg = normalizeSmoothingConfig({ enabled: true, beta: 0.1 });
    expect(cfg).toEqual({ enabled: true, minCutoff: 1.0, beta: 0.1, dCutoff: 1.0 });
  });

  it('treats explicit enabled: false in object form as disabled', () => {
    const cfg = normalizeSmoothingConfig({ enabled: false, beta: 0.1 });
    expect(cfg.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- tests/angleCalculator.test.js`
Expected: 5 new tests fail with `normalizeSmoothingConfig is not a function` or similar import error.

- [ ] **Step 3: Implement the helper**

In `client/js/angleCalculator.js`, after the `import { KEYPOINT_NAMES }` line, add:

```javascript
import { OneEuroFilter } from './filterPipeline.js';

const SMOOTHING_DEFAULTS = Object.freeze({
  minCutoff: 1.0,
  beta: 0.05,
  dCutoff: 1.0
});

/**
 * Normalize the `angles.smoothing` config field into a canonical object.
 * Accepts:
 *   - undefined / null   → disabled with defaults
 *   - false / true       → disabled/enabled with defaults
 *   - object             → fields override defaults; `enabled` defaults to true
 *                          when in object form unless explicitly false.
 */
export function normalizeSmoothingConfig(value) {
  if (value === true) {
    return { enabled: true, ...SMOOTHING_DEFAULTS };
  }
  if (value === false || value === undefined || value === null) {
    return { enabled: false, ...SMOOTHING_DEFAULTS };
  }
  if (typeof value === 'object') {
    return {
      enabled: value.enabled !== false,
      minCutoff: value.minCutoff ?? SMOOTHING_DEFAULTS.minCutoff,
      beta: value.beta ?? SMOOTHING_DEFAULTS.beta,
      dCutoff: value.dCutoff ?? SMOOTHING_DEFAULTS.dCutoff
    };
  }
  return { enabled: false, ...SMOOTHING_DEFAULTS };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- tests/angleCalculator.test.js`
Expected: 5 new tests pass. All existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add client/js/angleCalculator.js tests/angleCalculator.test.js
git commit -m "feat(angles): add normalizeSmoothingConfig helper

Canonicalizes the angles.smoothing config field. Accepts scalar
(true/false) and object forms; both produce a uniform
{enabled, minCutoff, beta, dCutoff} shape."
```

---

## Task 2: `AngleSmoother` class — happy path

**Files:**
- Modify: `client/js/angleCalculator.js`
- Test: `tests/angleCalculator.test.js`

Smooths a per-frame `{joint: number|null}` angle map. Lazy-creates one `OneEuroFilter` per joint name on first valid reading.

- [ ] **Step 1: Write the failing tests**

Append to `tests/angleCalculator.test.js`:

```javascript
describe('AngleSmoother', () => {
  it('passes input through unchanged when disabled', () => {
    const smoother = new AngleSmoother({ enabled: false, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 });
    const out = smoother.smooth({ left_elbow: 90, right_knee: 145 }, 1000);
    expect(out).toEqual({ left_elbow: 90, right_knee: 145 });
  });

  it('emits the first sample unchanged (filter initialization)', () => {
    const smoother = new AngleSmoother({ enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 });
    const out = smoother.smooth({ left_elbow: 90 }, 1000);
    expect(out.left_elbow).toBeCloseTo(90, 5);
  });

  it('converges to a constant input within ~30 frames', () => {
    const smoother = new AngleSmoother({ enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 });
    let t = 0;
    let out;
    for (let i = 0; i < 30; i++) {
      t += 33; // ~30 FPS
      out = smoother.smooth({ left_elbow: 120 }, t);
    }
    // Constant input → filter output should converge to the input.
    expect(out.left_elbow).toBeCloseTo(120, 1);
  });

  it('isolates state per joint', () => {
    const smoother = new AngleSmoother({ enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 });
    let t = 0;
    // Push only into left_elbow for many frames.
    for (let i = 0; i < 10; i++) {
      t += 33;
      smoother.smooth({ left_elbow: 30 }, t);
    }
    // First sample of right_knee should pass through (fresh filter).
    t += 33;
    const out = smoother.smooth({ right_knee: 175 }, t);
    expect(out.right_knee).toBeCloseTo(175, 5);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- tests/angleCalculator.test.js`
Expected: 4 new tests fail with `AngleSmoother is not a constructor`.

- [ ] **Step 3: Implement the class**

In `client/js/angleCalculator.js`, after the `normalizeSmoothingConfig` function and before the `JOINT_ANGLES` constant, add:

```javascript
/**
 * Smooths a per-frame angle map using one OneEuroFilter per joint.
 * Filters are lazy-created on first valid reading.
 *
 * Input/output shape: { jointName: number|null }
 * - number: passed through the per-joint filter
 * - null:   resets that joint's filter and returns null
 */
export class AngleSmoother {
  constructor(config) {
    this.config = config;
    this.filters = new Map();
  }

  smooth(angles, timestamp) {
    if (!this.config.enabled || !angles) {
      return angles;
    }
    const out = {};
    for (const [joint, value] of Object.entries(angles)) {
      if (value === null || value === undefined) {
        const f = this.filters.get(joint);
        if (f) f.reset();
        out[joint] = null;
        continue;
      }
      let filter = this.filters.get(joint);
      if (!filter) {
        filter = new OneEuroFilter(30, this.config.minCutoff, this.config.beta, this.config.dCutoff);
        this.filters.set(joint, filter);
      }
      out[joint] = filter.filter(value, timestamp);
    }
    return out;
  }

  updateConfig(newConfig) {
    this.config = newConfig;
    for (const filter of this.filters.values()) {
      filter.updateParams({
        minCutoff: newConfig.minCutoff,
        beta: newConfig.beta,
        dCutoff: newConfig.dCutoff
      });
    }
  }

  reset() {
    this.filters.clear();
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test -- tests/angleCalculator.test.js`
Expected: all 4 new `AngleSmoother` tests pass. Existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add client/js/angleCalculator.js tests/angleCalculator.test.js
git commit -m "feat(angles): add AngleSmoother class

Per-joint OneEuroFilter, lazy-created on first valid reading.
Bypasses input when disabled. State isolated per joint name."
```

---

## Task 3: `AngleSmoother` — null handling and config update

**Files:**
- Modify: `client/js/angleCalculator.js` (no change — class already supports this)
- Test: `tests/angleCalculator.test.js`

Verify null-on-visibility-loss resets the filter and a subsequent valid reading starts fresh (no snap-through), and that `updateConfig` changes live behavior.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('AngleSmoother')` block:

```javascript
  it('resets per-joint filter on null and starts fresh on next valid value', () => {
    const smoother = new AngleSmoother({ enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 });
    let t = 0;
    // Train the filter on ~30°
    for (let i = 0; i < 20; i++) {
      t += 33;
      smoother.smooth({ left_elbow: 30 }, t);
    }
    // Visibility drops -> null
    t += 33;
    const lost = smoother.smooth({ left_elbow: null }, t);
    expect(lost.left_elbow).toBe(null);
    // Visibility returns at a very different angle. After reset, filter
    // initializes to this new value -> first sample passes through.
    t += 33;
    const back = smoother.smooth({ left_elbow: 170 }, t);
    expect(back.left_elbow).toBeCloseTo(170, 5);
  });

  it('updateConfig changes filter behavior live', () => {
    const smoother = new AngleSmoother({ enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 });
    let t = 0;
    // Initialize the filter.
    smoother.smooth({ left_elbow: 90 }, (t += 33));
    // Bump beta way up — should make filter much more responsive.
    smoother.updateConfig({ enabled: true, minCutoff: 1.0, beta: 5.0, dCutoff: 1.0 });
    // Single big jump.
    const out = smoother.smooth({ left_elbow: 150 }, (t += 33));
    // With aggressive beta, output should be close to the new input,
    // not lagging back near 90.
    expect(out.left_elbow).toBeGreaterThan(130);
  });
```

- [ ] **Step 2: Run tests, verify they pass immediately**

Run: `npm test -- tests/angleCalculator.test.js`
Expected: both new tests pass — the `AngleSmoother` class from Task 2 already implements both behaviors. This task exists to *prove* the behaviors with explicit tests; if either fails, the bug is in Task 2's class and must be fixed there.

- [ ] **Step 3: Commit**

```bash
git add tests/angleCalculator.test.js
git commit -m "test(angles): verify AngleSmoother null handling and live config"
```

---

## Task 4: Wire smoother into `AngleCalculator`

**Files:**
- Modify: `client/js/angleCalculator.js` (the `AngleCalculator` class)
- Test: `tests/angleCalculator.test.js`

`AngleCalculator` instantiates the smoother in its constructor using `normalizeSmoothingConfig(config.smoothing)`, runs raw angles through it in `onPoseDetected`, and forwards config changes in `updateConfig`.

- [ ] **Step 1: Write the failing integration tests**

Append to the file (new top-level `describe`):

```javascript
describe('AngleCalculator smoothing integration', () => {
  let dataBus;
  beforeEach(() => {
    dataBus = new DataBus();
  });

  // Helper: build a fake pose with all 33 keypoints having a given x,y.
  function fakePose(elbowFlex) {
    // We construct points such that the left elbow angle (indices 11,13,15)
    // resolves to elbowFlex degrees. Keep it simple: use a 2D angle in xy
    // with z=0 and visibility=1 for every point so the calculator doesn't
    // filter anything out.
    const kp = Array.from({ length: 33 }, (_, i) => ({
      index: i, x: 0, y: 0, z: 0, visibility: 1.0
    }));
    // Shoulder (11) at (1,0); elbow (13) at origin (vertex); wrist (15)
    // at (cos θ, sin θ) where θ = elbowFlex.
    const rad = (elbowFlex * Math.PI) / 180;
    kp[11] = { index: 11, x: 1, y: 0, z: 0, visibility: 1.0 };
    kp[13] = { index: 13, x: 0, y: 0, z: 0, visibility: 1.0 };
    kp[15] = { index: 15, x: Math.cos(rad), y: Math.sin(rad), z: 0, visibility: 1.0 };
    return {
      detected: true,
      timestamp: 1000,
      pose: { normalized: kp, pixel: kp, world: kp }
    };
  }

  it('smooths emitted angles when smoothing.enabled is true', () => {
    const calc = new AngleCalculator(dataBus, {
      enabled: true,
      joints: ['left_elbow'],
      coordinateSystem: 'normalized',
      smoothing: { enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 }
    });
    calc.start();

    const events = [];
    dataBus.on('angles:calculated', (ev) => events.push(ev));

    // Feed a sequence of frames; angle stays at 90° → smoother converges.
    let t = 1000;
    for (let i = 0; i < 5; i++) {
      const pose = fakePose(90);
      pose.timestamp = (t += 33);
      dataBus.emit('pose:detected', pose);
    }
    expect(events.length).toBe(5);
    // Last emitted angle should be very close to 90 (filter converged).
    expect(events[events.length - 1].angles.left_elbow).toBeCloseTo(90, 1);
  });

  it('passes raw angles through when smoothing.enabled is false', () => {
    const calc = new AngleCalculator(dataBus, {
      enabled: true,
      joints: ['left_elbow'],
      coordinateSystem: 'normalized',
      smoothing: false
    });
    calc.start();

    const events = [];
    dataBus.on('angles:calculated', (ev) => events.push(ev));

    // One frame at 90°. With smoothing off the raw calculator output is
    // already 90 (rounded to 1 decimal); we just want to confirm it's
    // not transformed.
    dataBus.emit('pose:detected', fakePose(90));
    expect(events[0].angles.left_elbow).toBeCloseTo(90, 1);
  });

  it('accepts scalar smoothing: true as enabled with defaults', () => {
    const calc = new AngleCalculator(dataBus, {
      enabled: true,
      joints: ['left_elbow'],
      coordinateSystem: 'normalized',
      smoothing: true
    });
    expect(calc.smoother.config.enabled).toBe(true);
    expect(calc.smoother.config.beta).toBe(0.05);
  });

  it('updateConfig propagates new smoothing params to the smoother', () => {
    const calc = new AngleCalculator(dataBus, {
      enabled: true,
      joints: ['left_elbow'],
      coordinateSystem: 'normalized',
      smoothing: { enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 }
    });
    calc.updateConfig({
      smoothing: { enabled: true, minCutoff: 2.0, beta: 0.2, dCutoff: 1.0 }
    });
    expect(calc.smoother.config.beta).toBe(0.2);
    expect(calc.smoother.config.minCutoff).toBe(2.0);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- tests/angleCalculator.test.js`
Expected: 4 new tests fail because `calc.smoother` is undefined and `angles:calculated` events emit unsmoothed values.

- [ ] **Step 3: Modify `AngleCalculator` constructor**

Replace the existing constructor in `client/js/angleCalculator.js`:

```javascript
  constructor(dataBus, config) {
    this.dataBus = dataBus;
    this.config = config || {
      enabled: false,
      joints: 'all',
      coordinateSystem: 'world',
      smoothing: false
    };

    this.enabled = this.config.enabled !== false;
    this.unsubscribe = null;
    this.lastAngles = null;
    this.smoother = new AngleSmoother(normalizeSmoothingConfig(this.config.smoothing));

    // Bind methods
    this.onPoseDetected = this.onPoseDetected.bind(this);
  }
```

- [ ] **Step 4: Modify `onPoseDetected` to run angles through the smoother**

Replace the existing `onPoseDetected` method:

```javascript
  onPoseDetected(poseData) {
    if (!this.enabled) {
      return;
    }

    const rawAngles = calculateJointAngles(poseData, this.config);
    if (!rawAngles) {
      return;
    }

    const angles = this.smoother.smooth(rawAngles, poseData.timestamp);
    this.lastAngles = angles;

    this.dataBus.emit('angles:calculated', {
      timestamp: poseData.timestamp,
      angles: angles
    });
  }
```

- [ ] **Step 5: Modify `updateConfig` to forward to smoother**

Replace the existing `updateConfig` method:

```javascript
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.enabled = this.config.enabled !== false;
    if (newConfig.smoothing !== undefined) {
      this.smoother.updateConfig(normalizeSmoothingConfig(newConfig.smoothing));
    }
  }
```

- [ ] **Step 6: Run all tests, verify all pass**

Run: `npm test`
Expected: all tests pass — the 4 new integration tests plus all 344+ existing tests. Total should be 344 + 5 (Task 1) + 4 (Task 2) + 2 (Task 3) + 4 (Task 4) = 359 tests.

- [ ] **Step 7: Commit**

```bash
git add client/js/angleCalculator.js tests/angleCalculator.test.js
git commit -m "feat(angles): wire AngleSmoother into AngleCalculator

Raw angles from calculateJointAngles are now passed through the
per-joint smoother before emitting angles:calculated. Backwards
compatible with scalar smoothing: true|false config."
```

---

## Task 5: Update config files

**Files:**
- Modify: `config/config.yaml:116`
- Modify: `config/config.example.yaml` (mirror change)

- [ ] **Step 1: Update `config/config.yaml`**

Replace line 116 (`smoothing: false`) with the object form:

```yaml
  smoothing:                                 # Temporal smoothing of angle values
    enabled: true                            # Apply 1-Euro filter per joint
    minCutoff: 1.0                           # Hz; lower = more smoothing at rest
    beta: 0.05                               # higher = faster response to motion
    dCutoff: 1.0
```

- [ ] **Step 2: Mirror the same change in `config/config.example.yaml`**

Find the corresponding `smoothing:` line in `config/config.example.yaml` and apply the identical replacement. If the example file already has the object form or differs in defaults, leave the line alone but ensure the `smoothing.enabled: true` invariant is present so new users get the smoothed experience.

- [ ] **Step 3: Run server and verify config parses**

Run: `npm start` (background) then `curl -s http://localhost:3000/api/config | grep -o '"smoothing":[^,}]*'`
Expected: response contains `"smoothing":{"enabled":true,...}`.

Stop the server (PowerShell: `Get-Process node | Stop-Process -Force`).

- [ ] **Step 4: Run full test suite once more**

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 5: Commit**

```bash
git add config/config.yaml config/config.example.yaml
git commit -m "config: enable angle smoothing by default

Switch angles.smoothing from boolean to object form with explicit
1-Euro defaults (minCutoff=1.0, beta=0.05). Backwards compatible
with the scalar form."
```

---

## Task 6: DEVLOG entry

**Files:**
- Modify: `documentation/mediapipe-pose-DEVLOG.md`

- [ ] **Step 1: Append a Sprint 17 entry to the DEVLOG**

Read the most recent sprint entry (Sprint 11) for tone and structure, then append a new section at the end of the file:

```markdown

## Sprint 17 - Angle Smoothing

**Date:** 2026-05-23

**Summary:**
Added per-joint temporal smoothing to AngleCalculator using the existing
OneEuroFilter from filterPipeline.js. Filter state is lazy-created per
joint name and reset on visibility loss (null angle), preventing the next
valid reading from snapping through stale state.

**Design Decisions:**
- Reused OneEuroFilter rather than introducing a new algorithm — keeps
  angle smoothing behavior coherent with the keypoint pipeline.
- New AngleSmoother class is internal to angleCalculator.js since it has
  only one consumer. No new file.
- Config supports both scalar (smoothing: true|false) and object forms
  for backwards compatibility with the Sprint 11 placeholder flag.
- Default beta=0.05 is intentionally higher than the keypoint pipeline's
  0.007: angles change much faster per frame than positions due to arccos
  amplification, so the filter needs a more aggressive response coefficient
  to avoid feeling laggy.
- Null on visibility loss → reset that joint's filter. The alternative
  (carrying stale state across visibility gaps) produces visible pops
  when tracking resumes.

**Files Changed:**
- client/js/angleCalculator.js: added AngleSmoother class,
  normalizeSmoothingConfig helper, wired into AngleCalculator
- config/config.yaml, config/config.example.yaml: object-form smoothing
- tests/angleCalculator.test.js: 15 new tests across normalizer, smoother,
  and integration

**Tests:** 15 new (5 normalizer, 6 smoother, 4 integration). All passing.

**Known Issues:**
- Default beta of 0.05 is a starting point; may need live tuning per use
  case via config hot-reload.
- Repeated visibility flicker degrades smoothing because the filter resets
  on every gap. Acceptable tradeoff vs. snap-through.

**Next Sprint:**
Sprint 10 (Multi-Person Tracking) remains the only roadmap sprint not
implemented. Other future work: Sprint 14 advanced filters (Kalman),
Sprint 16 gesture state machines, Sprint 18 angle velocity/acceleration.
```

- [ ] **Step 2: Commit**

```bash
git add documentation/mediapipe-pose-DEVLOG.md
git commit -m "docs: DEVLOG entry for Sprint 17 (angle smoothing)"
```

---

## Final Verification

- [ ] **Run the full suite once more**

Run: `npm test`
Expected: all tests pass. Test count up by 15 from the baseline of 344 → 359.

- [ ] **Smoke test the running app**

Run: `npm start` (background)
Run: `curl -s http://localhost:3000/api/config | python -c "import json,sys; print(json.load(sys.stdin)['angles']['smoothing'])"`
Expected output: `{'enabled': True, 'minCutoff': 1.0, 'beta': 0.05, 'dCutoff': 1.0}`

Stop the server.

The user can then open `http://localhost:3000` in a browser to manually verify the smoothing feels right. That step is for the user, not this plan.
