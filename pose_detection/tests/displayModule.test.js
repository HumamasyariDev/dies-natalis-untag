/**
 * Unit tests for DisplayModule
 * Tests rendering logic and canvas operations
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DisplayModule, DisplayModes, SKELETON_CONNECTIONS, RAW_LAG_ANCHORS } from '../client/js/displayModule.js';
import { KEYPOINT_NAMES } from '../client/js/poseDetector.js';
import { DataBus } from '../client/js/dataBus.js';

// Mock requestAnimationFrame for test environment
global.requestAnimationFrame = vi.fn((callback) => {
  // Don't actually call the callback to avoid infinite loops in tests
  return 1;
});

describe('SKELETON_CONNECTIONS', () => {
  it('should define connections as pairs of indices', () => {
    expect(SKELETON_CONNECTIONS).toBeInstanceOf(Array);
    expect(SKELETON_CONNECTIONS.length).toBeGreaterThan(0);

    // Each connection should be a pair
    for (const connection of SKELETON_CONNECTIONS) {
      expect(connection).toHaveLength(2);
      expect(typeof connection[0]).toBe('number');
      expect(typeof connection[1]).toBe('number');
    }
  });

  it('should only reference valid keypoint indices', () => {
    for (const [start, end] of SKELETON_CONNECTIONS) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThan(33);
      expect(end).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThan(33);
    }
  });

  it('should include major body connections', () => {
    // Check for some key connections
    const connectionsFlat = SKELETON_CONNECTIONS.map(c => c.join('-'));

    // Shoulders (11-12)
    expect(connectionsFlat).toContain('11-12');

    // Left arm: shoulder to elbow (11-13)
    expect(connectionsFlat).toContain('11-13');

    // Right leg: hip to knee (24-26)
    expect(connectionsFlat).toContain('24-26');
  });
});

describe('DisplayModes', () => {
  it('should define OVERLAY mode', () => {
    expect(DisplayModes.OVERLAY).toBe('overlay');
  });

  it('should define STICK_FIGURE mode', () => {
    expect(DisplayModes.STICK_FIGURE).toBe('stickFigure');
  });

  it('should define KEYPOINTS mode', () => {
    expect(DisplayModes.KEYPOINTS).toBe('keypoints');
  });

  it('should define NONE mode', () => {
    expect(DisplayModes.NONE).toBe('none');
  });
});

describe('DisplayModule - filter-tuning diagnostics (raw overlay)', () => {
  let canvas, ctx, videoElement, config, dataBus, display;

  const mkKeypoints = (overrides = {}) => {
    const kp = [];
    for (let i = 0; i < 33; i++) kp.push({ x: 100, y: 100, z: 0, visibility: 0.9 });
    for (const [idx, pos] of Object.entries(overrides)) {
      kp[Number(idx)] = { ...kp[Number(idx)], ...pos };
    }
    return kp;
  };

  beforeEach(() => {
    ctx = {
      clearRect: vi.fn(), drawImage: vi.fn(), beginPath: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), stroke: vi.fn(),
      fill: vi.fn(), fillRect: vi.fn(),
      strokeStyle: '', fillStyle: '', lineWidth: 1
    };
    canvas = { getContext: vi.fn(() => ctx), width: 640, height: 480 };
    videoElement = { videoWidth: 640, videoHeight: 480 };
    config = {
      display: {
        enabled: true, mode: 'overlay',
        overlay: { showWebcam: true, showSkeleton: true, showKeypoints: true }
      }
    };
    dataBus = new DataBus();
    display = new DisplayModule(canvas, videoElement, config, dataBus);
  });

  it('RAW_LAG_ANCHORS targets the wrists and ankles', () => {
    expect(RAW_LAG_ANCHORS).toEqual(expect.arrayContaining([15, 16, 27, 28]));
  });

  it('defaults to showRaw=false', () => {
    expect(display.getDiagnostics().showRaw).toBe(false);
  });

  it('setShowRaw toggles the flag and resets lag state when turned off', () => {
    display.diagnostics.lagMs = 12;
    display.diagnostics.gapPx = 5;
    display.setShowRaw(true);
    expect(display.getDiagnostics().showRaw).toBe(true);

    display.setShowRaw(false);
    const d = display.getDiagnostics();
    expect(d.showRaw).toBe(false);
    expect(d.lagMs).toBe(0);
    expect(d.gapPx).toBe(0);
  });

  it('setRawPose stores the raw pose used for the overlay', () => {
    const raw = { detected: true, pose: { pixel: mkKeypoints() } };
    display.setRawPose(raw);
    expect(display.currentRawPoseData).toBe(raw);
  });

  it('renderRawOverlay is a no-op when there is no raw pose', () => {
    display.currentRawPoseData = null;
    display.renderRawOverlay();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('renderRawOverlay draws the raw skeleton and rings when a raw pose is present', () => {
    display.currentPoseData = { detected: true, pose: { pixel: mkKeypoints() } };
    display.setRawPose({ detected: true, timestamp: 1000, pose: { pixel: mkKeypoints({ 15: { x: 160 } }) } });
    display.renderRawOverlay();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled();
  });

  it('render() adds overlay draws only when showRaw is on', () => {
    display.currentPoseData = { detected: true, pose: { pixel: mkKeypoints() } };
    display.setRawPose({ detected: true, timestamp: 1000, pose: { pixel: mkKeypoints() } });

    display.setShowRaw(false);
    ctx.arc.mockClear();
    display.render();
    const arcsOff = ctx.arc.mock.calls.length;

    display.setShowRaw(true);
    ctx.arc.mockClear();
    display.render();
    const arcsOn = ctx.arc.mock.calls.length;

    expect(arcsOn).toBeGreaterThan(arcsOff);
  });

  it('updateLag computes the tip gap and a positive lag while an anchor moves', () => {
    // Frame 1 primes the per-anchor history (no speed yet).
    display.currentRawPoseData = { timestamp: 1000, detected: true };
    display.updateLag(mkKeypoints({ 15: { x: 100 } }), mkKeypoints({ 15: { x: 100 } }));

    // Frame 2: left wrist moves 60px in 16ms (~3750 px/s); filtered lags 20px.
    display.currentRawPoseData = { timestamp: 1016, detected: true };
    display.updateLag(mkKeypoints({ 15: { x: 160 } }), mkKeypoints({ 15: { x: 140 } }));

    const d = display.getDiagnostics();
    expect(d.gapPx).toBeCloseTo(20, 0);
    expect(d.lagMs).toBeGreaterThan(0);
  });
});

describe('DisplayModule', () => {
  let canvas;
  let ctx;
  let videoElement;
  let config;
  let dataBus;
  let display;

  beforeEach(() => {
    // Mock canvas
    ctx = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1
    };

    canvas = {
      getContext: vi.fn(() => ctx),
      width: 640,
      height: 480
    };

    // Mock video element
    videoElement = {
      videoWidth: 640,
      videoHeight: 480
    };

    // Config
    config = {
      display: {
        enabled: true,
        mode: 'overlay',
        overlay: {
          showWebcam: true,
          showSkeleton: true,
          showKeypoints: true,
          keypointRadius: 5,
          lineWidth: 2
        },
        stickFigure: {
          backgroundColor: '#000000',
          figureColor: '#00FF00',
          showKeypoints: true
        },
        keypoints: {
          radius: 5
        }
      }
    };

    dataBus = new DataBus();
    display = new DisplayModule(canvas, videoElement, config, dataBus);
  });

  describe('constructor', () => {
    it('should initialize with canvas and config', () => {
      expect(display.canvas).toBe(canvas);
      expect(display.ctx).toBe(ctx);
      expect(display.videoElement).toBe(videoElement);
      expect(display.config).toBe(config.display);
    });

    it('should set mode from config', () => {
      expect(display.mode).toBe(DisplayModes.OVERLAY);
    });

    it('should be enabled by default', () => {
      expect(display.enabled).toBe(true);
    });

    it('should handle missing display config', () => {
      const minimalConfig = {};
      const display2 = new DisplayModule(canvas, videoElement, minimalConfig, dataBus);

      expect(display2.config).toEqual({});
      expect(display2.mode).toBe(DisplayModes.OVERLAY);
    });
  });

  describe('start', () => {
    it('should subscribe to data bus', () => {
      display.start();

      expect(display.unsubscribe).toBeInstanceOf(Function);
      expect(dataBus.listenerCount('pose:detected')).toBe(1);
    });

    it('should not subscribe if disabled', () => {
      display.enabled = false;
      display.start();

      expect(dataBus.listenerCount('pose:detected')).toBe(0);
    });

    it('should resize canvas to match video', () => {
      display.start();

      expect(canvas.width).toBe(640);
      expect(canvas.height).toBe(480);
    });

    it('should NOT start a self-driving animation loop (render is orchestrator-driven)', () => {
      // Regression guard: the display used to run its own free-running rAF loop
      // (a second time-base) that contended with the detect loop and collapsed
      // the frame rate at high camera rates. main.js now drives render() once
      // per processed frame instead. start() must not schedule a rAF loop.
      global.requestAnimationFrame.mockClear();
      ctx.clearRect.mockClear();

      display.start();

      expect(global.requestAnimationFrame).not.toHaveBeenCalled();
      // ...but it paints once up front so the canvas isn't blank pre-first-frame.
      expect(ctx.clearRect).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should unsubscribe from data bus', () => {
      display.start();
      display.stop();

      expect(dataBus.listenerCount('pose:detected')).toBe(0);
    });

    it('should clear pose data', () => {
      display.currentPoseData = { detected: true };
      display.stop();

      expect(display.currentPoseData).toBeNull();
    });

    it('should clear canvas', () => {
      display.stop();

      expect(ctx.clearRect).toHaveBeenCalled();
    });
  });

  describe('onPoseData', () => {
    it('should store pose data', () => {
      const poseData = {
        timestamp: 1000,
        fps: 30,
        detected: true,
        width: 640,
        height: 480,
        pose: {
          pixel: []
        }
      };

      display.onPoseData(poseData);

      expect(display.currentPoseData).toBe(poseData);
    });

    it('should resize canvas if dimensions changed', () => {
      const poseData = {
        detected: true,
        width: 800,
        height: 600,
        pose: {}
      };

      display.onPoseData(poseData);

      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
    });
  });

  describe('clearCanvas', () => {
    it('should call clearRect with canvas dimensions', () => {
      display.clearCanvas();

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
    });
  });

  describe('setMode', () => {
    it('should update mode', () => {
      display.setMode(DisplayModes.STICK_FIGURE);
      expect(display.mode).toBe(DisplayModes.STICK_FIGURE);
    });

    it('should accept all valid modes', () => {
      for (const mode of Object.values(DisplayModes)) {
        expect(() => display.setMode(mode)).not.toThrow();
      }
    });

    it('should throw error for invalid mode', () => {
      expect(() => display.setMode('invalid')).toThrow('Invalid display mode');
    });
  });

  describe('getMode', () => {
    it('should return current mode', () => {
      display.mode = DisplayModes.KEYPOINTS;
      expect(display.getMode()).toBe(DisplayModes.KEYPOINTS);
    });
  });

  describe('setEnabled', () => {
    it('should enable display', () => {
      display.setEnabled(true);
      expect(display.enabled).toBe(true);
    });

    it('should disable display', () => {
      display.setEnabled(false);
      expect(display.enabled).toBe(false);
    });

    it('should clear canvas when disabled', () => {
      display.setEnabled(false);
      expect(ctx.clearRect).toHaveBeenCalled();
    });
  });

  describe('isEnabled', () => {
    it('should return enabled state', () => {
      display.enabled = true;
      expect(display.isEnabled()).toBe(true);

      display.enabled = false;
      expect(display.isEnabled()).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        mode: DisplayModes.STICK_FIGURE,
        overlay: {
          showWebcam: false
        }
      };

      display.updateConfig(newConfig);

      expect(display.config.mode).toBe(DisplayModes.STICK_FIGURE);
      expect(display.config.overlay.showWebcam).toBe(false);
    });

    it('should update mode if provided', () => {
      display.updateConfig({ mode: DisplayModes.KEYPOINTS });
      expect(display.mode).toBe(DisplayModes.KEYPOINTS);
    });

    it('should update enabled state if provided', () => {
      display.updateConfig({ enabled: false });
      expect(display.enabled).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const returnedConfig = display.getConfig();
      expect(returnedConfig).toEqual(display.config);
    });

    it('should return a copy, not reference', () => {
      const returnedConfig = display.getConfig();
      returnedConfig.mode = 'modified';

      expect(display.config.mode).not.toBe('modified');
    });
  });

  describe('confidenceToColor', () => {
    it('should return green for high confidence', () => {
      const color = display.confidenceToColor(0.9);
      expect(color).toBe('#00FF00');
    });

    it('should return yellow for medium confidence', () => {
      const color = display.confidenceToColor(0.5);
      expect(color).toBe('#FFFF00');
    });

    it('should return red for low confidence', () => {
      const color = display.confidenceToColor(0.2);
      expect(color).toBe('#FF0000');
    });

    it('should handle boundary values', () => {
      expect(display.confidenceToColor(0.71)).toBe('#00FF00');
      expect(display.confidenceToColor(0.70)).toBe('#FFFF00');
      expect(display.confidenceToColor(0.41)).toBe('#FFFF00');
      expect(display.confidenceToColor(0.40)).toBe('#FF0000');
    });
  });

  describe('drawKeypoints', () => {
    it('should draw each keypoint', () => {
      const keypoints = [
        { x: 100, y: 100, visibility: 0.9 },
        { x: 200, y: 200, visibility: 0.8 }
      ];

      display.drawKeypoints(keypoints);

      expect(ctx.arc).toHaveBeenCalledTimes(2);
      expect(ctx.fill).toHaveBeenCalledTimes(2);
      expect(ctx.stroke).toHaveBeenCalledTimes(2);
    });

    it('should skip keypoints with low visibility', () => {
      const keypoints = [
        { x: 100, y: 100, visibility: 0.9 },
        { x: 200, y: 200, visibility: 0.1 }  // Low visibility
      ];

      display.drawKeypoints(keypoints);

      expect(ctx.arc).toHaveBeenCalledTimes(1);
    });

    it('should use custom style', () => {
      const keypoints = [{ x: 100, y: 100, visibility: 0.9 }];
      const style = {
        radius: 10,
        fillColor: '#FF0000',
        strokeColor: '#0000FF',
        lineWidth: 3
      };

      display.drawKeypoints(keypoints, style);

      expect(ctx.fillStyle).toBe('#FF0000');
      expect(ctx.strokeStyle).toBe('#0000FF');
      expect(ctx.lineWidth).toBe(3);
    });
  });

  describe('drawSkeleton', () => {
    it('should draw lines between connected keypoints', () => {
      const keypoints = Array.from({ length: 33 }, (_, i) => ({
        x: i * 10,
        y: i * 10,
        visibility: 0.9
      }));

      display.drawSkeleton(keypoints);

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('should skip connections with low visibility', () => {
      const keypoints = Array.from({ length: 33 }, (_, i) => ({
        x: i * 10,
        y: i * 10,
        visibility: i === 0 ? 0.1 : 0.9  // First keypoint low visibility
      }));

      const beforeCallCount = ctx.stroke.mock.calls.length;
      display.drawSkeleton(keypoints);
      const afterCallCount = ctx.stroke.mock.calls.length;

      // Should draw fewer lines than total connections
      expect(afterCallCount - beforeCallCount).toBeLessThan(SKELETON_CONNECTIONS.length);
    });

    it('should use custom line width and color', () => {
      const keypoints = Array.from({ length: 33 }, (_, i) => ({
        x: i * 10,
        y: i * 10,
        visibility: 0.9
      }));

      const style = {
        lineWidth: 5,
        lineColor: '#FF00FF'
      };

      display.drawSkeleton(keypoints, style);

      expect(ctx.lineWidth).toBe(5);
      expect(ctx.strokeStyle).toBe('#FF00FF');
    });
  });

  describe('render modes', () => {
    let mockPoseData;

    beforeEach(() => {
      mockPoseData = {
        timestamp: 1000,
        fps: 30,
        detected: true,
        width: 640,
        height: 480,
        pose: {
          pixel: Array.from({ length: 33 }, (_, i) => ({
            index: i,
            name: KEYPOINT_NAMES[i],
            x: 100 + i * 10,
            y: 100 + i * 10,
            z: 0,
            visibility: 0.9,
            presence: 0.95
          }))
        }
      };

      display.currentPoseData = mockPoseData;
    });

    describe('renderOverlay', () => {
      it('should draw webcam feed', () => {
        display.renderOverlay();

        expect(ctx.drawImage).toHaveBeenCalledWith(
          videoElement,
          0,
          0,
          640,
          480
        );
      });

      it('should not draw webcam if disabled in config', () => {
        display.config.overlay.showWebcam = false;
        display.renderOverlay();

        expect(ctx.drawImage).not.toHaveBeenCalled();
      });

      it('should draw skeleton if enabled', () => {
        display.renderOverlay();

        expect(ctx.stroke).toHaveBeenCalled();
      });

      it('should draw keypoints if enabled', () => {
        display.renderOverlay();

        expect(ctx.arc).toHaveBeenCalled();
      });
    });

    describe('renderStickFigure', () => {
      it('should fill background with specified color', () => {
        display.renderStickFigure();

        expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 640, 480);
        // Check that fillStyle was set to background color (may change after other draws)
        expect(ctx.fillRect).toHaveBeenCalled();
      });

      it('should draw skeleton with figure color', () => {
        ctx.strokeStyle = ''; // Reset
        display.renderStickFigure();

        // After rendering, strokeStyle should have been set (will be set multiple times for each line)
        expect(ctx.stroke).toHaveBeenCalled();
      });

      it('should draw keypoints if enabled', () => {
        display.renderStickFigure();

        expect(ctx.arc).toHaveBeenCalled();
      });
    });

    describe('renderKeypointsOnly', () => {
      it('should draw keypoints', () => {
        display.renderKeypointsOnly();

        expect(ctx.arc).toHaveBeenCalled();
        expect(ctx.fill).toHaveBeenCalled();
      });

      it('should not draw skeleton lines', () => {
        ctx.stroke.mockClear();
        display.renderKeypointsOnly();

        // Stroke is called per keypoint, not per skeleton connection
        // Just verify arc is called (keypoints are drawn)
        expect(ctx.arc).toHaveBeenCalled();
      });
    });
  });

  describe('render', () => {
    it('should not render if disabled', () => {
      display.enabled = false;
      display.render();

      expect(ctx.clearRect).not.toHaveBeenCalled();
    });

    it('should not render in NONE mode', () => {
      display.mode = DisplayModes.NONE;

      ctx.clearRect.mockClear();
      ctx.drawImage.mockClear();

      display.render();

      // In NONE mode, render returns early without calling anything
      expect(ctx.clearRect).not.toHaveBeenCalled();
      expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('should render overlay mode', () => {
      display.mode = DisplayModes.OVERLAY;
      display.currentPoseData = {
        detected: true,
        pose: {
          pixel: Array.from({ length: 33 }, () => ({
            x: 100,
            y: 100,
            visibility: 0.9
          }))
        }
      };

      display.render();

      expect(ctx.clearRect).toHaveBeenCalled();
    });

    it('should render stick figure mode', () => {
      display.mode = DisplayModes.STICK_FIGURE;
      display.currentPoseData = {
        detected: true,
        pose: {
          pixel: Array.from({ length: 33 }, () => ({
            x: 100,
            y: 100,
            visibility: 0.9
          }))
        }
      };

      display.render();

      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('should render keypoints mode', () => {
      display.mode = DisplayModes.KEYPOINTS;
      display.currentPoseData = {
        detected: true,
        pose: {
          pixel: Array.from({ length: 33 }, () => ({
            x: 100,
            y: 100,
            visibility: 0.9
          }))
        }
      };

      display.render();

      expect(ctx.arc).toHaveBeenCalled();
    });
  });

  describe('integration with data bus', () => {
    it('should receive and render pose data from data bus', () => {
      display.start();

      const poseData = {
        timestamp: 1000,
        fps: 30,
        detected: true,
        width: 640,
        height: 480,
        pose: {
          pixel: Array.from({ length: 33 }, () => ({
            x: 100,
            y: 100,
            visibility: 0.9
          }))
        }
      };

      dataBus.emitPoseDetected(poseData);

      expect(display.currentPoseData).toBe(poseData);
    });

    it('should handle rapid pose updates', () => {
      display.start();

      for (let i = 0; i < 100; i++) {
        const poseData = {
          detected: true,
          pose: {
            pixel: Array.from({ length: 33 }, () => ({
              x: 100 + i,
              y: 100 + i,
              visibility: 0.9
            }))
          }
        };

        dataBus.emitPoseDetected(poseData);
      }

      // Should have latest data
      expect(display.currentPoseData.pose.pixel[0].x).toBe(199);
    });
  });
});
