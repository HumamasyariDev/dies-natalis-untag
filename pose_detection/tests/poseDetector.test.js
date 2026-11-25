/**
 * Unit tests for PoseDetector module
 * Tests coordinate conversions, landmark formatting, and detector behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  KEYPOINT_NAMES,
  normalizedToPixel,
  pixelToNormalized,
  formatLandmarks,
  PoseDetector
} from '../client/js/poseDetector.js';

describe('KEYPOINT_NAMES', () => {
  it('should have exactly 33 keypoints', () => {
    expect(KEYPOINT_NAMES).toHaveLength(33);
  });

  it('should start with nose', () => {
    expect(KEYPOINT_NAMES[0]).toBe('nose');
  });

  it('should end with right_foot_index', () => {
    expect(KEYPOINT_NAMES[32]).toBe('right_foot_index');
  });

  it('should have all expected body parts', () => {
    const expectedParts = [
      'nose',
      'left_shoulder', 'right_shoulder',
      'left_elbow', 'right_elbow',
      'left_wrist', 'right_wrist',
      'left_hip', 'right_hip',
      'left_knee', 'right_knee',
      'left_ankle', 'right_ankle'
    ];

    for (const part of expectedParts) {
      expect(KEYPOINT_NAMES).toContain(part);
    }
  });
});

describe('normalizedToPixel', () => {
  it('should convert center point correctly', () => {
    const result = normalizedToPixel(0.5, 0.5, 640, 480);
    expect(result.x).toBe(320);
    expect(result.y).toBe(240);
  });

  it('should convert top-left corner', () => {
    const result = normalizedToPixel(0, 0, 640, 480);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('should convert bottom-right corner', () => {
    const result = normalizedToPixel(1, 1, 640, 480);
    expect(result.x).toBe(640);
    expect(result.y).toBe(480);
  });

  it('should round to nearest pixel', () => {
    const result = normalizedToPixel(0.333, 0.666, 640, 480);
    expect(result.x).toBe(213); // 0.333 * 640 = 213.12
    expect(result.y).toBe(320); // 0.666 * 480 = 319.68
  });

  it('should handle different resolutions', () => {
    const result = normalizedToPixel(0.25, 0.75, 1920, 1080);
    expect(result.x).toBe(480);
    expect(result.y).toBe(810);
  });
});

describe('pixelToNormalized', () => {
  it('should convert center point correctly', () => {
    const result = pixelToNormalized(320, 240, 640, 480);
    expect(result.x).toBe(0.5);
    expect(result.y).toBe(0.5);
  });

  it('should convert top-left corner', () => {
    const result = pixelToNormalized(0, 0, 640, 480);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('should convert bottom-right corner', () => {
    const result = pixelToNormalized(640, 480, 640, 480);
    expect(result.x).toBe(1);
    expect(result.y).toBe(1);
  });

  it('should maintain precision', () => {
    const result = pixelToNormalized(213, 320, 640, 480);
    expect(result.x).toBeCloseTo(0.333, 2);
    expect(result.y).toBeCloseTo(0.667, 2);
  });
});

describe('formatLandmarks', () => {
  let mockLandmarks;

  beforeEach(() => {
    // Create mock landmarks with 33 points
    mockLandmarks = Array.from({ length: 33 }, (_, i) => ({
      x: i / 33,
      y: (33 - i) / 33,
      z: -0.05 * i,
      visibility: 0.9,
      presence: 0.95
    }));
  });

  it('should format landmarks with both coordinate systems', () => {
    const result = formatLandmarks(mockLandmarks, null, 640, 480, {
      normalized: true,
      pixel: true,
      world: false
    });

    expect(result.normalized).toHaveLength(33);
    expect(result.pixel).toHaveLength(33);
    expect(result.world).toBeNull();
  });

  it('should include correct keypoint names', () => {
    const result = formatLandmarks(mockLandmarks, null, 640, 480, {
      normalized: true,
      pixel: false,
      world: false
    });

    expect(result.normalized[0].name).toBe('nose');
    expect(result.normalized[11].name).toBe('left_shoulder');
    expect(result.normalized[32].name).toBe('right_foot_index');
  });

  it('should include index in each keypoint', () => {
    const result = formatLandmarks(mockLandmarks, null, 640, 480, {
      normalized: true,
      pixel: false,
      world: false
    });

    for (let i = 0; i < 33; i++) {
      expect(result.normalized[i].index).toBe(i);
    }
  });

  it('should include visibility and presence scores', () => {
    const result = formatLandmarks(mockLandmarks, null, 640, 480, {
      normalized: true,
      pixel: false,
      world: false
    });

    expect(result.normalized[0].visibility).toBe(0.9);
    expect(result.normalized[0].presence).toBe(0.95);
  });

  it('should default visibility and presence to 0 if missing', () => {
    const landmarksWithoutScores = mockLandmarks.map(l => ({
      x: l.x,
      y: l.y,
      z: l.z
      // no visibility or presence
    }));

    const result = formatLandmarks(landmarksWithoutScores, null, 640, 480, {
      normalized: true,
      pixel: false,
      world: false
    });

    expect(result.normalized[0].visibility).toBe(0);
    expect(result.normalized[0].presence).toBe(0);
  });

  it('should convert to pixel coordinates correctly', () => {
    const result = formatLandmarks(mockLandmarks, null, 640, 480, {
      normalized: false,
      pixel: true,
      world: false
    });

    // First landmark at x=0/33, y=33/33
    expect(result.pixel[0].x).toBe(0);
    expect(result.pixel[0].y).toBe(480);

    // Check z is preserved
    expect(result.pixel[0].z).toBeCloseTo(0, 5);
  });

  it('should return null for disabled coordinate systems', () => {
    const result = formatLandmarks(mockLandmarks, null, 640, 480, {
      normalized: false,
      pixel: false,
      world: false
    });

    expect(result.normalized).toBeNull();
    expect(result.pixel).toBeNull();
    expect(result.world).toBeNull();
  });

  it('should use default config if not provided', () => {
    const result = formatLandmarks(mockLandmarks, null, 640, 480);

    expect(result.normalized).toHaveLength(33);
    expect(result.pixel).toHaveLength(33);
    expect(result.world).toBeNull();
  });
});

describe('PoseDetector', () => {
  let detector;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      detector: {
        modelPath: './models/pose_landmarker_lite.task',
        runningMode: 'VIDEO',
        numPoses: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        minPosePresenceConfidence: 0.5
      },
      performance: {
        targetFps: 30,
        enableGpu: true
      },
      coordinates: {
        normalized: true,
        pixel: true,
        world: false
      }
    };

    detector = new PoseDetector(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(detector.config).toBe(mockConfig);
      expect(detector.isInitialized).toBe(false);
      expect(detector.poseLandmarker).toBeNull();
    });

    it('should start with zero FPS', () => {
      expect(detector.fps).toBe(0);
      expect(detector.frameCount).toBe(0);
    });
  });

  describe('isReady', () => {
    it('should return false before initialization', () => {
      expect(detector.isReady()).toBe(false);
    });
  });

  describe('detect', () => {
    it('should throw error if not initialized', () => {
      const mockInput = { videoWidth: 640, videoHeight: 480 };
      expect(() => detector.detect(mockInput)).toThrow('PoseDetector not initialized');
    });
  });

  describe('close', () => {
    it('should handle close when not initialized', () => {
      expect(() => detector.close()).not.toThrow();
      expect(detector.isInitialized).toBe(false);
    });
  });

  describe('setRunningMode', () => {
    it('should throw error if not initialized', async () => {
      await expect(detector.setRunningMode('IMAGE'))
        .rejects.toThrow('PoseDetector not initialized');
    });
  });

  describe('getFps', () => {
    it('should return current FPS', () => {
      expect(detector.getFps()).toBe(0);
    });
  });
});

describe('PoseDetector with mocked MediaPipe', () => {
  let detector;
  let mockConfig;
  let mockPoseLandmarker;

  beforeEach(() => {
    mockConfig = {
      detector: {
        modelPath: './models/pose_landmarker_lite.task',
        runningMode: 'VIDEO',
        numPoses: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        minPosePresenceConfidence: 0.5
      },
      performance: {
        targetFps: 30,
        enableGpu: true
      },
      coordinates: {
        normalized: true,
        pixel: true,
        world: false
      }
    };

    detector = new PoseDetector(mockConfig);

    // Create mock pose landmarker
    mockPoseLandmarker = {
      detect: vi.fn(),
      detectForVideo: vi.fn(),
      setOptions: vi.fn(),
      close: vi.fn()
    };
  });

  describe('detect with mock', () => {
    beforeEach(() => {
      // Manually set detector as initialized with mock
      detector.poseLandmarker = mockPoseLandmarker;
      detector.isInitialized = true;
      detector.lastFpsUpdate = performance.now();
    });

    it('should return detected: true with pose data', () => {
      const mockLandmarks = Array.from({ length: 33 }, (_, i) => ({
        x: 0.5,
        y: 0.5,
        z: 0,
        visibility: 0.9,
        presence: 0.95
      }));

      mockPoseLandmarker.detectForVideo.mockReturnValue({
        landmarks: [mockLandmarks]
      });

      const mockInput = { videoWidth: 640, videoHeight: 480 };
      const result = detector.detect(mockInput, 1000);

      expect(result.detected).toBe(true);
      expect(result.pose).not.toBeNull();
      expect(result.pose.normalized).toHaveLength(33);
      expect(result.pose.pixel).toHaveLength(33);
      expect(result.width).toBe(640);
      expect(result.height).toBe(480);
      expect(result.timestamp).toBe(1000);
    });

    it('should return detected: false when no pose found', () => {
      mockPoseLandmarker.detectForVideo.mockReturnValue({
        landmarks: []
      });

      const mockInput = { videoWidth: 640, videoHeight: 480 };
      const result = detector.detect(mockInput, 1000);

      expect(result.detected).toBe(false);
      expect(result.pose).toBeNull();
    });

    it('should use detect() for IMAGE mode', () => {
      detector.config.detector.runningMode = 'IMAGE';

      const mockLandmarks = Array.from({ length: 33 }, () => ({
        x: 0.5, y: 0.5, z: 0, visibility: 0.9, presence: 0.95
      }));

      mockPoseLandmarker.detect.mockReturnValue({
        landmarks: [mockLandmarks]
      });

      const mockInput = { width: 640, height: 480 };
      const result = detector.detect(mockInput);

      expect(mockPoseLandmarker.detect).toHaveBeenCalled();
      expect(mockPoseLandmarker.detectForVideo).not.toHaveBeenCalled();
      expect(result.detected).toBe(true);
    });

    it('should update FPS calculation', () => {
      mockPoseLandmarker.detectForVideo.mockReturnValue({ landmarks: [] });
      const mockInput = { videoWidth: 640, videoHeight: 480 };

      // Run multiple detections
      for (let i = 0; i < 10; i++) {
        detector.detect(mockInput, i * 100);
      }

      expect(detector.frameCount).toBe(10);
    });

    it('should handle input with width/height instead of videoWidth/videoHeight', () => {
      const mockLandmarks = Array.from({ length: 33 }, () => ({
        x: 0.5, y: 0.5, z: 0, visibility: 0.9, presence: 0.95
      }));

      mockPoseLandmarker.detectForVideo.mockReturnValue({
        landmarks: [mockLandmarks]
      });

      const mockInput = { width: 800, height: 600 };
      const result = detector.detect(mockInput, 1000);

      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });
  });

  describe('close with mock', () => {
    it('should call close on poseLandmarker', () => {
      detector.poseLandmarker = mockPoseLandmarker;
      detector.isInitialized = true;

      detector.close();

      expect(mockPoseLandmarker.close).toHaveBeenCalled();
      expect(detector.poseLandmarker).toBeNull();
      expect(detector.isInitialized).toBe(false);
    });
  });

  describe('setRunningMode with mock', () => {
    it('should update config and call setOptions', async () => {
      detector.poseLandmarker = mockPoseLandmarker;
      detector.isInitialized = true;
      mockPoseLandmarker.setOptions.mockResolvedValue();

      await detector.setRunningMode('IMAGE');

      expect(detector.config.detector.runningMode).toBe('IMAGE');
      expect(mockPoseLandmarker.setOptions).toHaveBeenCalledWith({
        runningMode: 'IMAGE'
      });
    });

    it('should reject invalid running mode', async () => {
      detector.poseLandmarker = mockPoseLandmarker;
      detector.isInitialized = true;

      await expect(detector.setRunningMode('INVALID'))
        .rejects.toThrow('Invalid running mode: INVALID');
    });

    it('should accept all valid running modes', async () => {
      detector.poseLandmarker = mockPoseLandmarker;
      detector.isInitialized = true;
      mockPoseLandmarker.setOptions.mockResolvedValue();

      const validModes = ['IMAGE', 'VIDEO', 'LIVE_STREAM'];
      for (const mode of validModes) {
        await expect(detector.setRunningMode(mode)).resolves.not.toThrow();
      }
    });
  });
});
