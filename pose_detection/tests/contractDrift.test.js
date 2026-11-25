/**
 * Contract drift integration tests
 *
 * This file constructs real (non-mocked) instances of the core modules
 * with realistic config shapes and verifies they wire together correctly.
 *
 * Background: a prior code review found that several modules were rewritten
 * to take the full app config but the call sites in main.js were never
 * updated to match. The mocked unit tests passed happily; the real app
 * was silently broken. These tests exist to catch that class of bug.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PoseDetector } from '../client/js/poseDetector.js';
import { FilterPipeline } from '../client/js/filterPipeline.js';
import { DisplayModule } from '../client/js/displayModule.js';
import { AngleCalculator } from '../client/js/angleCalculator.js';
import { DataBus } from '../client/js/dataBus.js';

function buildFullConfig() {
  return {
    detector: {
      modelPath: './models/pose_landmarker_full.task',
      runningMode: 'VIDEO',
      numPoses: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      minPosePresenceConfidence: 0.5
    },
    performance: { targetFps: 30, enableGpu: false },
    input: { source: 'webcam', webcamId: 0 },
    filtering: {
      enabled: true,
      type: 'oneEuro',
      oneEuroConfig: { minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 }
    },
    coordinates: { normalized: true, pixel: true, world: true },
    display: {
      enabled: true,
      mode: 'overlay',
      overlay: { showWebcam: true, showSkeleton: true, showKeypoints: true, keypointRadius: 5, lineWidth: 2 },
      stickFigure: { backgroundColor: '#000', figureColor: '#0f0', showKeypoints: true },
      keypoints: { showAll: true, visibleJoints: 'all', radius: 5 }
    },
    angles: {
      enabled: true,
      joints: ['left_elbow'],
      coordinateSystem: 'normalized',
      smoothing: { enabled: true, minCutoff: 1.0, beta: 0.05, dCutoff: 1.0 }
    }
  };
}

describe('Contract drift — main.js wires real modules together', () => {
  it('PoseDetector exposes detect() with (input, timestamp) signature', () => {
    const detector = new PoseDetector(buildFullConfig());
    expect(typeof detector.detect).toBe('function');
    // The bug we are guarding against: main.js used to call detectForVideo,
    // which never existed. Assert that didn't sneak back.
    expect(detector.detectForVideo).toBeUndefined();
  });

  it('PoseDetector constructor reads detector/performance/coordinates from the FULL config', () => {
    const config = buildFullConfig();
    const detector = new PoseDetector(config);
    // The detector class internally accesses this.config.detector,
    // this.config.performance, this.config.coordinates. If main.js
    // passed only a subsection these would be undefined and initialize()
    // would crash.
    expect(detector.config.detector).toBeDefined();
    expect(detector.config.performance).toBeDefined();
    expect(detector.config.coordinates).toBeDefined();
  });

  it('FilterPipeline exposes process(poseData), not filter()', () => {
    const pipeline = new FilterPipeline(buildFullConfig());
    expect(typeof pipeline.process).toBe('function');
    // The bug: main.js called .filter() which only exists on the inner
    // OneEuroFilter instances, not on FilterPipeline itself.
    expect(pipeline.filter).toBeUndefined();
  });

  it('FilterPipeline constructor reads filtering/performance from FULL config', () => {
    const pipeline = new FilterPipeline(buildFullConfig());
    // 33 keypoints × 3 axes = 99 filters, each constructed with a real
    // numeric frequency. If main.js passes only oneEuroConfig, the
    // pipeline reads `config.filtering?.oneEuroConfig` → undefined and
    // every filter gets NaN frequency.
    expect(pipeline.getFilterCount()).toBe(99);
    // Sample a filter and verify its frequency is a real number, not NaN.
    const firstFilter = pipeline.filters.get('0_x');
    expect(Number.isFinite(firstFilter.freq)).toBe(true);
  });

  it('FilterPipeline.process() accepts and returns the pose shape main.js produces', () => {
    const pipeline = new FilterPipeline(buildFullConfig());
    const fakeKeypoints = Array.from({ length: 33 }, (_, i) => ({
      index: i, name: `kp${i}`, x: 0.5, y: 0.5, z: 0, visibility: 1.0, presence: 1.0
    }));
    const input = {
      timestamp: 1000,
      detected: true,
      fps: 30,
      width: 640,
      height: 480,
      pose: {
        normalized: fakeKeypoints,
        pixel: fakeKeypoints.map(k => ({ ...k, x: 320, y: 240 })),
        world: null
      }
    };
    const out = pipeline.process(input);
    expect(out.detected).toBe(true);
    expect(out.pose.normalized.length).toBe(33);
    expect(Number.isFinite(out.pose.normalized[0].x)).toBe(true);
  });

  it('DisplayModule constructor reads display/angles from FULL config', () => {
    const config = buildFullConfig();
    // jsdom provides a canvas-shaped object but no real 2D context, so we
    // shim getContext to keep construction non-throwing.
    const canvas = { getContext: () => ({}), width: 640, height: 480 };
    const videoElement = { videoWidth: 640, videoHeight: 480 };
    const dataBus = new DataBus();
    const display = new DisplayModule(canvas, videoElement, config, dataBus);
    // The bug: main.js passed this.config.display. DisplayModule then read
    // config.display.display → undefined, and every config field fell back
    // to a hardcoded default.
    expect(display.config).toBe(config.display);
    expect(display.anglesConfig).toBe(config.angles);
    expect(display.mode).toBe('overlay');
  });

  it('AngleCalculator wired with full angles config emits via DataBus', () => {
    const config = buildFullConfig();
    const dataBus = new DataBus();
    const calc = new AngleCalculator(dataBus, config.angles);
    calc.start();

    const events = [];
    dataBus.on('angles:calculated', (ev) => events.push(ev));

    // Synthetic pose with left elbow (kp indices 11/13/15) forming 90°.
    const kp = Array.from({ length: 33 }, (_, i) => ({
      index: i, x: 0, y: 0, z: 0, visibility: 1.0
    }));
    kp[11] = { index: 11, x: 1, y: 0, z: 0, visibility: 1.0 };
    kp[13] = { index: 13, x: 0, y: 0, z: 0, visibility: 1.0 };
    kp[15] = { index: 15, x: 0, y: 1, z: 0, visibility: 1.0 };

    dataBus.emit('pose:detected', {
      detected: true,
      timestamp: 1000,
      pose: { normalized: kp, pixel: kp, world: kp }
    });

    expect(events.length).toBe(1);
    expect(events[0].angles.left_elbow).toBeCloseTo(90, 1);
  });
});
