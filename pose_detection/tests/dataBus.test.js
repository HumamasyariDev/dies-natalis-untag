/**
 * Unit tests for DataBus module
 * Tests pub-sub event system for pose data distribution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataBus, EventTypes } from '../client/js/dataBus.js';

describe('EventTypes', () => {
  it('should define POSE_DETECTED event', () => {
    expect(EventTypes.POSE_DETECTED).toBe('pose:detected');
  });

  it('should define POSE_LOST event', () => {
    expect(EventTypes.POSE_LOST).toBe('pose:lost');
  });

  it('should define FPS_UPDATE event', () => {
    expect(EventTypes.FPS_UPDATE).toBe('fps:update');
  });

  it('should define CONFIG_CHANGED event', () => {
    expect(EventTypes.CONFIG_CHANGED).toBe('config:changed');
  });
});

describe('DataBus', () => {
  let bus;

  beforeEach(() => {
    bus = new DataBus();
  });

  describe('constructor', () => {
    it('should initialize with empty listeners', () => {
      expect(bus.eventNames()).toHaveLength(0);
    });
  });

  describe('on', () => {
    it('should add a listener for an event', () => {
      const callback = vi.fn();
      bus.on('test', callback);

      expect(bus.listenerCount('test')).toBe(1);
    });

    it('should allow multiple listeners for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      bus.on('test', callback1);
      bus.on('test', callback2);

      expect(bus.listenerCount('test')).toBe(2);
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = bus.on('test', callback);

      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
      expect(bus.listenerCount('test')).toBe(0);
    });

    it('should throw error for non-function callback', () => {
      expect(() => bus.on('test', 'not a function')).toThrow('Callback must be a function');
      expect(() => bus.on('test', null)).toThrow('Callback must be a function');
      expect(() => bus.on('test', {})).toThrow('Callback must be a function');
    });

    it('should not add duplicate listeners', () => {
      const callback = vi.fn();

      bus.on('test', callback);
      bus.on('test', callback);

      // Set prevents duplicates
      expect(bus.listenerCount('test')).toBe(1);
    });
  });

  describe('once', () => {
    it('should add a one-time listener', () => {
      const callback = vi.fn();
      bus.once('test', callback);

      expect(bus.listenerCount('test')).toBe(1);
    });

    it('should call listener only once', () => {
      const callback = vi.fn();
      bus.once('test', callback);

      bus.emit('test', 'data1');
      bus.emit('test', 'data2');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('data1');
    });

    it('should remove listener after first call', () => {
      const callback = vi.fn();
      bus.once('test', callback);

      bus.emit('test', 'data');

      expect(bus.listenerCount('test')).toBe(0);
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = bus.once('test', callback);

      unsubscribe();
      bus.emit('test', 'data');

      expect(callback).not.toHaveBeenCalled();
    });

    it('should throw error for non-function callback', () => {
      expect(() => bus.once('test', 'not a function')).toThrow('Callback must be a function');
    });
  });

  describe('off', () => {
    it('should remove a specific listener', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      bus.on('test', callback1);
      bus.on('test', callback2);

      bus.off('test', callback1);

      expect(bus.listenerCount('test')).toBe(1);

      bus.emit('test', 'data');
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should return true when listener was removed', () => {
      const callback = vi.fn();
      bus.on('test', callback);

      const result = bus.off('test', callback);
      expect(result).toBe(true);
    });

    it('should return false when listener was not found', () => {
      const callback = vi.fn();
      const result = bus.off('test', callback);
      expect(result).toBe(false);
    });

    it('should clean up empty listener sets', () => {
      const callback = vi.fn();
      bus.on('test', callback);
      bus.off('test', callback);

      expect(bus.eventNames()).not.toContain('test');
    });

    it('should remove once listeners', () => {
      const callback = vi.fn();
      bus.once('test', callback);

      const result = bus.off('test', callback);
      expect(result).toBe(true);
      expect(bus.listenerCount('test')).toBe(0);
    });
  });

  describe('emit', () => {
    it('should call all listeners with data', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      bus.on('test', callback1);
      bus.on('test', callback2);

      const data = { value: 42 };
      bus.emit('test', data);

      expect(callback1).toHaveBeenCalledWith(data);
      expect(callback2).toHaveBeenCalledWith(data);
    });

    it('should not throw when no listeners exist', () => {
      expect(() => bus.emit('nonexistent', 'data')).not.toThrow();
    });

    it('should handle errors in listeners gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalCallback = vi.fn();

      bus.on('test', errorCallback);
      bus.on('test', normalCallback);

      // Should not throw
      expect(() => bus.emit('test', 'data')).not.toThrow();

      // Both callbacks should have been called
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });

    it('should call once listeners before removing them', () => {
      const onceCallback = vi.fn();
      const regularCallback = vi.fn();

      bus.once('test', onceCallback);
      bus.on('test', regularCallback);

      bus.emit('test', 'first');
      bus.emit('test', 'second');

      expect(onceCallback).toHaveBeenCalledTimes(1);
      expect(onceCallback).toHaveBeenCalledWith('first');
      expect(regularCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for a specific event', () => {
      bus.on('event1', vi.fn());
      bus.on('event1', vi.fn());
      bus.on('event2', vi.fn());

      bus.removeAllListeners('event1');

      expect(bus.listenerCount('event1')).toBe(0);
      expect(bus.listenerCount('event2')).toBe(1);
    });

    it('should remove all listeners for all events', () => {
      bus.on('event1', vi.fn());
      bus.on('event2', vi.fn());
      bus.once('event3', vi.fn());

      bus.removeAllListeners();

      expect(bus.eventNames()).toHaveLength(0);
    });

    it('should remove once listeners too', () => {
      bus.once('test', vi.fn());
      bus.removeAllListeners('test');

      expect(bus.listenerCount('test')).toBe(0);
    });
  });

  describe('listenerCount', () => {
    it('should return 0 for events with no listeners', () => {
      expect(bus.listenerCount('nonexistent')).toBe(0);
    });

    it('should count regular listeners', () => {
      bus.on('test', vi.fn());
      bus.on('test', vi.fn());

      expect(bus.listenerCount('test')).toBe(2);
    });

    it('should count once listeners', () => {
      bus.once('test', vi.fn());

      expect(bus.listenerCount('test')).toBe(1);
    });

    it('should count both regular and once listeners', () => {
      bus.on('test', vi.fn());
      bus.once('test', vi.fn());

      expect(bus.listenerCount('test')).toBe(2);
    });
  });

  describe('eventNames', () => {
    it('should return empty array when no listeners', () => {
      expect(bus.eventNames()).toEqual([]);
    });

    it('should return all event names with listeners', () => {
      bus.on('event1', vi.fn());
      bus.on('event2', vi.fn());
      bus.once('event3', vi.fn());

      const names = bus.eventNames();
      expect(names).toContain('event1');
      expect(names).toContain('event2');
      expect(names).toContain('event3');
      expect(names).toHaveLength(3);
    });

    it('should not duplicate event names', () => {
      bus.on('test', vi.fn());
      bus.once('test', vi.fn());

      const names = bus.eventNames();
      expect(names.filter(n => n === 'test')).toHaveLength(1);
    });
  });

  describe('hasListeners', () => {
    it('should return false when no listeners', () => {
      expect(bus.hasListeners('test')).toBe(false);
    });

    it('should return true when listeners exist', () => {
      bus.on('test', vi.fn());
      expect(bus.hasListeners('test')).toBe(true);
    });

    it('should return true for once listeners', () => {
      bus.once('test', vi.fn());
      expect(bus.hasListeners('test')).toBe(true);
    });
  });

  describe('convenience methods', () => {
    describe('emitPoseDetected', () => {
      it('should emit pose:detected event', () => {
        const callback = vi.fn();
        bus.on(EventTypes.POSE_DETECTED, callback);

        const poseData = { detected: true, pose: {} };
        bus.emitPoseDetected(poseData);

        expect(callback).toHaveBeenCalledWith(poseData);
      });
    });

    describe('emitPoseLost', () => {
      it('should emit pose:lost event', () => {
        const callback = vi.fn();
        bus.on(EventTypes.POSE_LOST, callback);

        const data = { timestamp: 1000 };
        bus.emitPoseLost(data);

        expect(callback).toHaveBeenCalledWith(data);
      });
    });

    describe('emitFpsUpdate', () => {
      it('should emit fps:update event', () => {
        const callback = vi.fn();
        bus.on(EventTypes.FPS_UPDATE, callback);

        bus.emitFpsUpdate(29.5);

        expect(callback).toHaveBeenCalledWith(29.5);
      });
    });

    describe('emitConfigChanged', () => {
      it('should emit config:changed event', () => {
        const callback = vi.fn();
        bus.on(EventTypes.CONFIG_CHANGED, callback);

        const config = { detector: {} };
        bus.emitConfigChanged(config);

        expect(callback).toHaveBeenCalledWith(config);
      });
    });

    describe('onPoseDetected', () => {
      it('should subscribe to pose:detected event', () => {
        const callback = vi.fn();
        bus.onPoseDetected(callback);

        expect(bus.listenerCount(EventTypes.POSE_DETECTED)).toBe(1);
      });

      it('should return unsubscribe function', () => {
        const callback = vi.fn();
        const unsubscribe = bus.onPoseDetected(callback);

        unsubscribe();
        expect(bus.listenerCount(EventTypes.POSE_DETECTED)).toBe(0);
      });
    });

    describe('onPoseLost', () => {
      it('should subscribe to pose:lost event', () => {
        const callback = vi.fn();
        bus.onPoseLost(callback);

        expect(bus.listenerCount(EventTypes.POSE_LOST)).toBe(1);
      });
    });

    describe('onFpsUpdate', () => {
      it('should subscribe to fps:update event', () => {
        const callback = vi.fn();
        bus.onFpsUpdate(callback);

        expect(bus.listenerCount(EventTypes.FPS_UPDATE)).toBe(1);
      });
    });

    describe('onConfigChanged', () => {
      it('should subscribe to config:changed event', () => {
        const callback = vi.fn();
        bus.onConfigChanged(callback);

        expect(bus.listenerCount(EventTypes.CONFIG_CHANGED)).toBe(1);
      });
    });
  });

  describe('memory management', () => {
    it('should not leak memory on repeated subscribe/unsubscribe', () => {
      const callback = vi.fn();

      for (let i = 0; i < 1000; i++) {
        const unsubscribe = bus.on('test', callback);
        unsubscribe();
      }

      expect(bus.listenerCount('test')).toBe(0);
      expect(bus.eventNames()).not.toContain('test');
    });

    it('should not leak memory with once listeners', () => {
      for (let i = 0; i < 1000; i++) {
        bus.once('test', vi.fn());
        bus.emit('test', 'data');
      }

      expect(bus.listenerCount('test')).toBe(0);
    });

    it('should clean up after removeAllListeners', () => {
      for (let i = 0; i < 100; i++) {
        bus.on(`event${i}`, vi.fn());
      }

      bus.removeAllListeners();

      expect(bus.eventNames()).toHaveLength(0);
    });
  });

  describe('integration scenarios', () => {
    it('should support typical pose detection flow', () => {
      const displayCallback = vi.fn();
      const storageCallback = vi.fn();
      const fpsCallback = vi.fn();

      // Multiple consumers subscribe
      bus.onPoseDetected(displayCallback);
      bus.onPoseDetected(storageCallback);
      bus.onFpsUpdate(fpsCallback);

      // Simulate pose detection
      const poseData = {
        timestamp: 1000,
        fps: 30,
        detected: true,
        pose: {
          normalized: [{ x: 0.5, y: 0.5, z: 0 }]
        }
      };

      bus.emitPoseDetected(poseData);
      bus.emitFpsUpdate(30);

      expect(displayCallback).toHaveBeenCalledWith(poseData);
      expect(storageCallback).toHaveBeenCalledWith(poseData);
      expect(fpsCallback).toHaveBeenCalledWith(30);
    });

    it('should support unsubscribing mid-session', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsubscribe1 = bus.onPoseDetected(callback1);
      bus.onPoseDetected(callback2);

      // First emission
      bus.emitPoseDetected({ frame: 1 });

      // Unsubscribe one callback
      unsubscribe1();

      // Second emission
      bus.emitPoseDetected({ frame: 2 });

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(2);
    });

    it('should handle pose lost events', () => {
      const detectedCallback = vi.fn();
      const lostCallback = vi.fn();

      bus.onPoseDetected(detectedCallback);
      bus.onPoseLost(lostCallback);

      // Pose detected
      bus.emitPoseDetected({ detected: true });

      // Pose lost
      bus.emitPoseLost({ timestamp: 1000 });

      // Pose detected again
      bus.emitPoseDetected({ detected: true });

      expect(detectedCallback).toHaveBeenCalledTimes(2);
      expect(lostCallback).toHaveBeenCalledTimes(1);
    });
  });
});
