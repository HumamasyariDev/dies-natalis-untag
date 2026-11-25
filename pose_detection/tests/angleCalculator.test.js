/**
 * Unit tests for AngleCalculator module
 * Sprint 11: World Coordinates & Angle Calculations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateAngle, calculateJointAngles, AngleCalculator, JOINT_ANGLES, normalizeSmoothingConfig, AngleSmoother } from '../client/js/angleCalculator.js';
import { DataBus } from '../client/js/dataBus.js';

describe('AngleCalculator', () => {
  describe('calculateAngle', () => {
    it('should calculate 90 degree angle correctly', () => {
      const point1 = { x: 1, y: 0, z: 0 };
      const point2 = { x: 0, y: 0, z: 0 };  // Vertex
      const point3 = { x: 0, y: 1, z: 0 };

      const angle = calculateAngle(point1, point2, point3);
      expect(angle).toBeCloseTo(90, 1);
    });

    it('should calculate 180 degree angle correctly', () => {
      const point1 = { x: -1, y: 0, z: 0 };
      const point2 = { x: 0, y: 0, z: 0 };  // Vertex
      const point3 = { x: 1, y: 0, z: 0 };

      const angle = calculateAngle(point1, point2, point3);
      expect(angle).toBeCloseTo(180, 1);
    });

    it('should calculate 0 degree angle correctly', () => {
      const point1 = { x: 1, y: 0, z: 0 };
      const point2 = { x: 0, y: 0, z: 0 };  // Vertex
      const point3 = { x: 2, y: 0, z: 0 };

      const angle = calculateAngle(point1, point2, point3);
      expect(angle).toBeCloseTo(0, 1);
    });

    it('should calculate 45 degree angle correctly', () => {
      const point1 = { x: 1, y: 0, z: 0 };
      const point2 = { x: 0, y: 0, z: 0 };  // Vertex
      const point3 = { x: 0.707, y: 0.707, z: 0 };

      const angle = calculateAngle(point1, point2, point3);
      expect(angle).toBeCloseTo(45, 1);
    });

    it('should handle 3D angles correctly', () => {
      const point1 = { x: 1, y: 0, z: 0 };
      const point2 = { x: 0, y: 0, z: 0 };  // Vertex
      const point3 = { x: 0, y: 0, z: 1 };

      const angle = calculateAngle(point1, point2, point3);
      expect(angle).toBeCloseTo(90, 1);
    });

    it('should return 0 for degenerate cases (zero magnitude vectors)', () => {
      const point1 = { x: 0, y: 0, z: 0 };
      const point2 = { x: 0, y: 0, z: 0 };  // Vertex (same as point1)
      const point3 = { x: 1, y: 0, z: 0 };

      const angle = calculateAngle(point1, point2, point3);
      expect(angle).toBe(0);
    });
  });

  describe('calculateJointAngles', () => {
    const createMockPoseData = (visibility = 1.0) => {
      // Create 33 keypoints with default positions
      const keypoints = Array.from({ length: 33 }, (_, index) => ({
        index,
        name: `keypoint_${index}`,
        x: 0,
        y: 0,
        z: 0,
        visibility,
        presence: 1.0
      }));

      // Set specific positions for joints we're testing
      // Left elbow (shoulder=11, elbow=13, wrist=15)
      keypoints[11] = { index: 11, name: 'left_shoulder', x: 0, y: 0, z: 0, visibility, presence: 1.0 };
      keypoints[13] = { index: 13, name: 'left_elbow', x: 1, y: 0, z: 0, visibility, presence: 1.0 };
      keypoints[15] = { index: 15, name: 'left_wrist', x: 1, y: 1, z: 0, visibility, presence: 1.0 };

      // Right knee (hip=24, knee=26, ankle=28)
      keypoints[24] = { index: 24, name: 'right_hip', x: 0, y: 0, z: 0, visibility, presence: 1.0 };
      keypoints[26] = { index: 26, name: 'right_knee', x: 0, y: -1, z: 0, visibility, presence: 1.0 };
      keypoints[28] = { index: 28, name: 'right_ankle', x: 0, y: -2, z: 0, visibility, presence: 1.0 };

      return {
        timestamp: Date.now(),
        fps: 30,
        detected: true,
        pose: {
          normalized: keypoints
        }
      };
    };

    it('should calculate all joint angles when joints config is "all"', () => {
      const poseData = createMockPoseData();
      const config = {
        joints: 'all',
        coordinateSystem: 'normalized'
      };

      const angles = calculateJointAngles(poseData, config);

      expect(angles).toBeDefined();
      expect(Object.keys(angles).length).toBe(Object.keys(JOINT_ANGLES).length);
      expect(angles).toHaveProperty('left_elbow');
      expect(angles).toHaveProperty('right_knee');
    });

    it('should calculate left elbow angle correctly', () => {
      const poseData = createMockPoseData();
      const config = {
        joints: ['left_elbow'],
        coordinateSystem: 'normalized'
      };

      const angles = calculateJointAngles(poseData, config);

      expect(angles.left_elbow).toBeCloseTo(90, 0);
    });

    it('should calculate right knee angle correctly', () => {
      const poseData = createMockPoseData();
      const config = {
        joints: ['right_knee'],
        coordinateSystem: 'normalized'
      };

      const angles = calculateJointAngles(poseData, config);

      expect(angles.right_knee).toBeCloseTo(180, 0);
    });

    it('should return null for joints with low visibility', () => {
      const poseData = createMockPoseData(0.3); // Low visibility
      const config = {
        joints: ['left_elbow'],
        coordinateSystem: 'normalized'
      };

      const angles = calculateJointAngles(poseData, config);

      expect(angles.left_elbow).toBeNull();
    });

    it('should return null when pose is not detected', () => {
      const poseData = {
        timestamp: Date.now(),
        fps: 30,
        detected: false,
        pose: null
      };
      const config = {
        joints: 'all',
        coordinateSystem: 'normalized'
      };

      const angles = calculateJointAngles(poseData, config);

      expect(angles).toBeNull();
    });

    it('should calculate only specified joints', () => {
      const poseData = createMockPoseData();
      const config = {
        joints: ['left_elbow', 'right_knee'],
        coordinateSystem: 'normalized'
      };

      const angles = calculateJointAngles(poseData, config);

      expect(Object.keys(angles).length).toBe(2);
      expect(angles).toHaveProperty('left_elbow');
      expect(angles).toHaveProperty('right_knee');
      expect(angles).not.toHaveProperty('left_knee');
    });

    it('should use world coordinates when configured', () => {
      const poseData = createMockPoseData();
      // Add world coordinates
      poseData.pose.world = poseData.pose.normalized.map(kp => ({ ...kp }));

      const config = {
        joints: ['left_elbow'],
        coordinateSystem: 'world'
      };

      const angles = calculateJointAngles(poseData, config);

      expect(angles.left_elbow).toBeDefined();
      expect(angles.left_elbow).toBeCloseTo(90, 0);
    });

    it('should fall back to normalized coordinates when world not available', () => {
      const poseData = createMockPoseData();
      const config = {
        joints: ['left_elbow'],
        coordinateSystem: 'world'
      };

      const angles = calculateJointAngles(poseData, config);

      expect(angles.left_elbow).toBeDefined();
    });
  });

  describe('AngleCalculator class', () => {
    let dataBus;
    let angleCalculator;

    beforeEach(() => {
      dataBus = new DataBus();
    });

    it('should initialize with correct config', () => {
      const config = {
        enabled: true,
        joints: 'all',
        coordinateSystem: 'world'
      };

      angleCalculator = new AngleCalculator(dataBus, config);

      expect(angleCalculator.config.enabled).toBe(true);
      expect(angleCalculator.enabled).toBe(true);
      expect(angleCalculator.config.joints).toBe('all');
    });

    it('should subscribe to pose events when started', () => {
      const config = { enabled: true, joints: 'all', coordinateSystem: 'normalized' };
      angleCalculator = new AngleCalculator(dataBus, config);

      const spy = vi.spyOn(dataBus, 'onPoseDetected');
      angleCalculator.start();

      expect(spy).toHaveBeenCalled();
    });

    it('should emit angles:calculated event when pose is detected', () => {
      const config = { enabled: true, joints: ['left_elbow'], coordinateSystem: 'normalized' };
      angleCalculator = new AngleCalculator(dataBus, config);
      angleCalculator.start();

      const emitSpy = vi.spyOn(dataBus, 'emit');

      // Create mock pose data
      const keypoints = Array.from({ length: 33 }, (_, index) => ({
        index,
        name: `keypoint_${index}`,
        x: 0,
        y: 0,
        z: 0,
        visibility: 1.0,
        presence: 1.0
      }));

      keypoints[11] = { index: 11, name: 'left_shoulder', x: 0, y: 0, z: 0, visibility: 1.0, presence: 1.0 };
      keypoints[13] = { index: 13, name: 'left_elbow', x: 1, y: 0, z: 0, visibility: 1.0, presence: 1.0 };
      keypoints[15] = { index: 15, name: 'left_wrist', x: 1, y: 1, z: 0, visibility: 1.0, presence: 1.0 };

      const poseData = {
        timestamp: Date.now(),
        fps: 30,
        detected: true,
        pose: { normalized: keypoints }
      };

      // Emit pose detected event
      dataBus.emitPoseDetected(poseData);

      // Verify angles:calculated was emitted
      expect(emitSpy).toHaveBeenCalledWith('angles:calculated', expect.objectContaining({
        timestamp: expect.any(Number),
        angles: expect.objectContaining({
          left_elbow: expect.any(Number)
        })
      }));
    });

    it('should not emit angles when disabled', () => {
      const config = { enabled: false, joints: 'all', coordinateSystem: 'normalized' };
      angleCalculator = new AngleCalculator(dataBus, config);
      angleCalculator.start();

      const emitSpy = vi.spyOn(dataBus, 'emit');

      const poseData = {
        timestamp: Date.now(),
        fps: 30,
        detected: false,
        pose: null
      };

      dataBus.emitPoseDetected(poseData);

      expect(emitSpy).not.toHaveBeenCalledWith('angles:calculated', expect.anything());
    });

    it('should unsubscribe when stopped', () => {
      const config = { enabled: true, joints: 'all', coordinateSystem: 'normalized' };
      angleCalculator = new AngleCalculator(dataBus, config);
      angleCalculator.start();

      expect(angleCalculator.unsubscribe).toBeDefined();

      angleCalculator.stop();

      expect(angleCalculator.unsubscribe).toBeNull();
    });

    it('should update config correctly', () => {
      const config = { enabled: true, joints: ['left_elbow'], coordinateSystem: 'normalized' };
      angleCalculator = new AngleCalculator(dataBus, config);

      angleCalculator.updateConfig({ joints: 'all', coordinateSystem: 'world' });

      expect(angleCalculator.config.joints).toBe('all');
      expect(angleCalculator.config.coordinateSystem).toBe('world');
    });
  });
});

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
    expect(out.left_elbow).toBeCloseTo(120, 1);
  });

  it('isolates state per joint', () => {
    const smoother = new AngleSmoother({ enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 });
    let t = 0;
    for (let i = 0; i < 10; i++) {
      t += 33;
      smoother.smooth({ left_elbow: 30 }, t);
    }
    t += 33;
    const out = smoother.smooth({ right_knee: 175 }, t);
    expect(out.right_knee).toBeCloseTo(175, 5);
  });

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
});

describe('AngleCalculator smoothing integration', () => {
  let dataBus;
  beforeEach(() => {
    dataBus = new DataBus();
  });

  // Helper: build a fake pose. Sets left elbow keypoints (11, 13, 15)
  // so calculateJointAngles resolves left_elbow to `elbowFlex` degrees.
  function fakePose(elbowFlex) {
    const kp = Array.from({ length: 33 }, (_, i) => ({
      index: i, x: 0, y: 0, z: 0, visibility: 1.0
    }));
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

    let t = 1000;
    for (let i = 0; i < 5; i++) {
      const pose = fakePose(90);
      pose.timestamp = (t += 33);
      dataBus.emit('pose:detected', pose);
    }
    expect(events.length).toBe(5);
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

  it('stop() clears smoother filter state so restart starts fresh', () => {
    const calc = new AngleCalculator(dataBus, {
      enabled: true,
      joints: ['left_elbow'],
      coordinateSystem: 'normalized',
      smoothing: { enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 }
    });
    calc.start();
    // Train the filter so it builds state.
    let t = 1000;
    for (let i = 0; i < 10; i++) {
      const pose = fakePose(30);
      pose.timestamp = (t += 33);
      dataBus.emit('pose:detected', pose);
    }
    expect(calc.smoother.filters.size).toBeGreaterThan(0);
    calc.stop();
    expect(calc.smoother.filters.size).toBe(0);
  });

  it('does not crash when config.joints is undefined (partial config)', () => {
    // Regression: a partial angles config that omits `joints` used to
    // crash calculateJointAngles with "undefined is not iterable".
    const calc = new AngleCalculator(dataBus, {
      enabled: true,
      coordinateSystem: 'normalized',
      smoothing: false
      // joints omitted
    });
    calc.start();

    const events = [];
    dataBus.on('angles:calculated', (ev) => events.push(ev));

    dataBus.emit('pose:detected', fakePose(90));
    // Should not throw and should calculate all defined joints by default.
    expect(events.length).toBe(1);
    expect(events[0].angles.left_elbow).toBeCloseTo(90, 1);
  });
});
