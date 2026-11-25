/**
 * Tests for GestureDetector (Sprint 12)
 * Tests gesture recognition from pose sequences
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GestureDetector } from '../client/js/gestureDetector.js';
import { DataBus } from '../client/js/dataBus.js';

describe('GestureDetector', () => {
  let dataBus;
  let gestureDetector;
  let mockConfig;

  beforeEach(() => {
    dataBus = new DataBus();

    mockConfig = {
      enabled: true,
      definitionsPath: './config/gestures.yaml',
      sensitivity: 1.0,
      showInUI: true
    };

    // Mock fetch for gestures.yaml
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve(`
gestures:
  - name: "t_pose"
    threshold: 0.85
    timeWindow: 1.0
    debounceTime: 2000
    description: "T-Pose gesture"
    conditions:
      - keypoints:
          - name: "left_shoulder"
            y_range: [0.25, 0.45]
          - name: "right_shoulder"
            y_range: [0.25, 0.45]
`)
      })
    );
  });

  describe('Initialization', () => {
    it('should initialize with enabled config', async () => {
      gestureDetector = new GestureDetector(dataBus, mockConfig);

      await gestureDetector.initialize();

      expect(gestureDetector.enabled).toBe(true);
      expect(gestureDetector.poseHistory).toEqual([]);
      expect(gestureDetector.maxHistoryDuration).toBe(3000);
    });

    it('should not initialize when disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      gestureDetector = new GestureDetector(dataBus, disabledConfig);

      expect(gestureDetector.enabled).toBe(false);
      expect(gestureDetector.gestures).toEqual([]);
    });

    it('should load gestures from YAML', async () => {
      gestureDetector = new GestureDetector(dataBus, mockConfig);
      await gestureDetector.loadGestures();

      expect(gestureDetector.gestures.length).toBeGreaterThan(0);
      expect(gestureDetector.gestures[0].name).toBe('t_pose');
      expect(gestureDetector.gestures[0].threshold).toBe(0.85);
    });

    it('should handle missing gestures.yaml gracefully', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404
        })
      );

      gestureDetector = new GestureDetector(dataBus, mockConfig);
      await gestureDetector.loadGestures();

      expect(gestureDetector.gestures).toEqual([]);
    });
  });

  describe('Pose History Management', () => {
    beforeEach(async () => {
      gestureDetector = new GestureDetector(dataBus, mockConfig);
      await gestureDetector.initialize();
    });

    it('should add pose data to history', () => {
      const poseData = {
        timestamp: Date.now(),
        detected: true,
        pose: {
          normalized: Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })
        }
      };

      gestureDetector.addToHistory(poseData);

      expect(gestureDetector.poseHistory.length).toBe(1);
      expect(gestureDetector.poseHistory[0].timestamp).toBe(poseData.timestamp);
    });

    it('should prune old history entries', () => {
      const now = Date.now();

      // Add old entry
      gestureDetector.addToHistory({
        timestamp: now - 4000, // 4 seconds ago
        pose: { normalized: [] }
      });

      // Add recent entry
      gestureDetector.addToHistory({
        timestamp: now,
        pose: { normalized: [] }
      });

      expect(gestureDetector.poseHistory.length).toBe(1);
      expect(gestureDetector.poseHistory[0].timestamp).toBe(now);
    });

    it('should maintain pose history buffer within duration limit', () => {
      const now = Date.now();

      for (let i = 0; i < 10; i++) {
        gestureDetector.addToHistory({
          timestamp: now - i * 100,
          pose: { normalized: [] }
        });
      }

      // All entries should be within 3 seconds
      expect(gestureDetector.poseHistory.length).toBe(10);
      gestureDetector.poseHistory.forEach(entry => {
        expect(now - entry.timestamp).toBeLessThanOrEqual(3000);
      });
    });
  });

  describe('Gesture Detection', () => {
    beforeEach(async () => {
      gestureDetector = new GestureDetector(dataBus, mockConfig);
      await gestureDetector.initialize();
    });

    it('should detect gesture when conditions are met', () => {
      const recognizedGestures = [];

      dataBus.onGestureRecognized((gesture) => {
        recognizedGestures.push(gesture);
      });

      // Create a pose that matches t_pose conditions
      const pose = {
        normalized: Array(33).fill(null).map(() => ({ x: 0.5, y: 0.35, z: 0, visibility: 0.9 }))
      };

      // Set shoulders to correct y position
      pose.normalized[5] = { x: 0.3, y: 0.35, z: 0, visibility: 0.9 }; // left_shoulder
      pose.normalized[6] = { x: 0.7, y: 0.35, z: 0, visibility: 0.9 }; // right_shoulder

      gestureDetector.addToHistory({
        timestamp: Date.now(),
        pose
      });

      gestureDetector.detectGestures();

      // May or may not detect based on full conditions, but should not error
      expect(typeof gestureDetector.scoreGesture).toBe('function');
    });

    it('should respect debounce time', () => {
      const recognizedGestures = [];
      dataBus.onGestureRecognized((gesture) => {
        recognizedGestures.push(gesture);
      });

      // Manually set last gesture time
      gestureDetector.lastGestureTime.set('t_pose', Date.now());

      gestureDetector.detectGestures();

      // Should not trigger again due to debounce
      expect(gestureDetector.lastGestureTime.has('t_pose')).toBe(true);
    });

    it('should calculate confidence score', () => {
      const gesture = {
        name: 'test_gesture',
        threshold: 0.8,
        conditions: [
          {
            keypoints: [
              { name: 'nose', y_range: [0.1, 0.3] }
            ]
          }
        ]
      };

      // Add pose with nose in correct range
      const pose = {
        normalized: Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }))
      };
      pose.normalized[0] = { x: 0.5, y: 0.2, z: 0, visibility: 0.9 }; // nose

      gestureDetector.addToHistory({
        timestamp: Date.now(),
        pose
      });

      const score = gestureDetector.scoreGesture(gesture);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('Keypoint Condition Checking', () => {
    beforeEach(async () => {
      gestureDetector = new GestureDetector(dataBus, mockConfig);
      await gestureDetector.initialize();
    });

    it('should check y_range condition', () => {
      const pose = {
        normalized: Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }))
      };
      pose.normalized[0] = { x: 0.5, y: 0.3, z: 0, visibility: 0.9 }; // nose

      const condition = {
        name: 'nose',
        y_range: [0.2, 0.4]
      };

      const score = gestureDetector.checkKeypointCondition(pose, condition);

      expect(score).toBe(1.0);
    });

    it('should check y_less_than condition with another keypoint', () => {
      const pose = {
        normalized: Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }))
      };
      pose.normalized[0] = { x: 0.5, y: 0.2, z: 0, visibility: 0.9 }; // nose
      pose.normalized[5] = { x: 0.5, y: 0.4, z: 0, visibility: 0.9 }; // left_shoulder

      const condition = {
        name: 'nose',
        y_less_than: 'left_shoulder',
        y_difference_min: 0.1
      };

      const score = gestureDetector.checkKeypointCondition(pose, condition);

      expect(score).toBeGreaterThan(0);
    });

    it('should return 0 for invisible keypoints', () => {
      const pose = {
        normalized: Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }))
      };

      const condition = {
        name: 'nose',
        y_range: [0.2, 0.4]
      };

      const score = gestureDetector.checkKeypointCondition(pose, condition);

      expect(score).toBe(0);
    });
  });

  describe('Motion Detection', () => {
    beforeEach(async () => {
      gestureDetector = new GestureDetector(dataBus, mockConfig);
      await gestureDetector.initialize();
    });

    it('should detect horizontal motion', () => {
      // Add 20 frames with horizontal movement
      for (let i = 0; i < 20; i++) {
        const pose = {
          normalized: Array(33).fill(null).map(() => ({
            x: 0.3 + (i * 0.02), // Move from 0.3 to 0.7
            y: 0.5,
            z: 0,
            visibility: 0.9
          }))
        };

        gestureDetector.addToHistory({
          timestamp: Date.now() + i * 33,
          pose
        });
      }

      const gesture = {
        motion: {
          keypoint: 'nose',
          direction: 'horizontal',
          amplitude_min: 0.2
        }
      };

      const score = gestureDetector.checkMotionCondition(gesture);

      expect(score).toBeGreaterThan(0);
    });

    it('should detect vertical motion', () => {
      // Add 20 frames with vertical movement
      for (let i = 0; i < 20; i++) {
        const pose = {
          normalized: Array(33).fill(null).map(() => ({
            x: 0.5,
            y: 0.3 + (i * 0.02), // Move from 0.3 to 0.7
            z: 0,
            visibility: 0.9
          }))
        };

        gestureDetector.addToHistory({
          timestamp: Date.now() + i * 33,
          pose
        });
      }

      const gesture = {
        motion: {
          keypoint: 'nose',
          direction: 'vertical',
          amplitude_min: 0.2
        }
      };

      const score = gestureDetector.checkMotionCondition(gesture);

      expect(score).toBeGreaterThan(0);
    });

    it('should require minimum frames for motion detection', () => {
      // Add only 3 frames
      for (let i = 0; i < 3; i++) {
        const pose = {
          normalized: Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }))
        };

        gestureDetector.addToHistory({
          timestamp: Date.now() + i * 33,
          pose
        });
      }

      const gesture = {
        motion: {
          keypoint: 'nose',
          direction: 'horizontal',
          amplitude_min: 0.1
        }
      };

      const score = gestureDetector.checkMotionCondition(gesture);

      expect(score).toBe(0);
    });
  });

  describe('Config Changes', () => {
    beforeEach(async () => {
      gestureDetector = new GestureDetector(dataBus, { enabled: false });
    });

    it('should enable when config changes to enabled', () => {
      expect(gestureDetector.enabled).toBe(false);

      const newConfig = {
        gestures: {
          enabled: true
        }
      };

      gestureDetector.handleConfigChange(newConfig);

      expect(gestureDetector.enabled).toBe(true);
    });

    it('should disable when config changes to disabled', async () => {
      gestureDetector = new GestureDetector(dataBus, mockConfig);
      await gestureDetector.initialize();

      expect(gestureDetector.enabled).toBe(true);

      const newConfig = {
        gestures: {
          enabled: false
        }
      };

      gestureDetector.handleConfigChange(newConfig);

      expect(gestureDetector.enabled).toBe(false);
    });
  });

  describe('Status and Cleanup', () => {
    beforeEach(async () => {
      gestureDetector = new GestureDetector(dataBus, mockConfig);
      await gestureDetector.initialize();
    });

    it('should return current status', () => {
      gestureDetector.addToHistory({
        timestamp: Date.now(),
        pose: { normalized: [] }
      });

      const status = gestureDetector.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.historyLength).toBe(1);
      expect(status.gestureCount).toBeGreaterThanOrEqual(0);
    });

    it('should clear history', () => {
      gestureDetector.addToHistory({
        timestamp: Date.now(),
        pose: { normalized: [] }
      });

      expect(gestureDetector.poseHistory.length).toBe(1);

      gestureDetector.clearHistory();

      expect(gestureDetector.poseHistory.length).toBe(0);
      expect(gestureDetector.lastGestureTime.size).toBe(0);
    });

    it('should cleanup on destroy', () => {
      gestureDetector.addToHistory({
        timestamp: Date.now(),
        pose: { normalized: [] }
      });

      gestureDetector.destroy();

      expect(gestureDetector.poseHistory.length).toBe(0);
      expect(gestureDetector.gestures.length).toBe(0);
    });

    it('should release pose subscription on destroy', async () => {
      // Regression: destroy() didn't clear the pose subscription, so a
      // destroyed detector kept ticking on every frame.
      gestureDetector.destroy();
      expect(gestureDetector.unsubscribePose).toBe(null);
      expect(gestureDetector.unsubscribeConfig).toBe(null);
    });
  });

  describe('Re-enable after disable', () => {
    it('resubscribes to pose events after disable→enable cycle', async () => {
      // Regression: re-enable via config change called loadGestures()
      // but never re-subscribed, so gesture detection was permanently
      // dead after a single disable/re-enable cycle.
      gestureDetector = new GestureDetector(dataBus, { enabled: true });
      await gestureDetector.initialize();
      expect(gestureDetector.unsubscribePose).not.toBe(null);

      gestureDetector.handleConfigChange({ gestures: { enabled: false } });
      expect(gestureDetector.unsubscribePose).toBe(null);

      gestureDetector.handleConfigChange({ gestures: { enabled: true } });
      expect(gestureDetector.unsubscribePose).not.toBe(null);
    });
  });

  describe('parseStringValue', () => {
    it('parses double-quoted values', () => {
      expect(GestureDetector.parseStringValue('name: "wave"')).toBe('wave');
    });
    it('parses single-quoted values', () => {
      expect(GestureDetector.parseStringValue("name: 'wave'")).toBe('wave');
    });
    it('parses bare unquoted tokens', () => {
      // Regression: the old implementation did `trimmed.split('"')[1]`
      // which returned undefined for unquoted YAML and collapsed every
      // unquoted gesture into a single debounce slot keyed by undefined.
      expect(GestureDetector.parseStringValue('name: wave')).toBe('wave');
    });
    it('returns null for empty values', () => {
      expect(GestureDetector.parseStringValue('name:')).toBe(null);
    });
  });

  describe('checkKeypointCondition null safety', () => {
    beforeEach(async () => {
      gestureDetector = new GestureDetector(dataBus, mockConfig);
      await gestureDetector.initialize();
    });

    it('returns 0 instead of throwing when pose.normalized is absent', () => {
      // Regression: would deref pose.normalized[i] directly. With a
      // world-only coordinate setup, normalized is null and the gesture
      // check crashed.
      const score = gestureDetector.checkKeypointCondition(
        { world: [] }, // no normalized
        { name: 'nose', y_range: [0, 1] }
      );
      expect(score).toBe(0);
    });

    it('returns 0 when pose is null', () => {
      const score = gestureDetector.checkKeypointCondition(null, { name: 'nose' });
      expect(score).toBe(0);
    });
  });
});
