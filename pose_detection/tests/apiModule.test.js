/**
 * Tests for ApiModule (Sprint 9)
 * Client-side module that forwards pose data to server
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiModule } from '../client/js/apiModule.js';
import { DataBus } from '../client/js/dataBus.js';

describe('ApiModule', () => {
  let dataBus;
  let apiModule;
  let mockFetch;

  beforeEach(() => {
    dataBus = new DataBus();

    // Mock global fetch
    mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, buffered: 1 })
      })
    );
    global.fetch = mockFetch;
  });

  describe('Initialization', () => {
    it('should initialize with enabled API', () => {
      const config = {
        api: {
          enabled: true,
          endpoints: {
            update: '/api/pose/update'
          }
        }
      };

      apiModule = new ApiModule(dataBus, config);

      expect(apiModule.enabled).toBe(true);
      expect(apiModule.connected).toBe(true);
      expect(apiModule.updateEndpoint).toBe('/api/pose/update');
    });

    it('should initialize with disabled API', () => {
      const config = {
        api: {
          enabled: false,
          endpoints: {
            update: '/api/pose/update'
          }
        }
      };

      apiModule = new ApiModule(dataBus, config);

      expect(apiModule.enabled).toBe(false);
      expect(apiModule.connected).toBe(false);
    });

    it('should handle missing config', () => {
      apiModule = new ApiModule(dataBus, {});

      expect(apiModule.enabled).toBe(false);
      expect(apiModule.updateEndpoint).toBe('/api/pose/update'); // default
    });

    it('should subscribe to Data Bus when enabled', () => {
      const config = { api: { enabled: true } };

      apiModule = new ApiModule(dataBus, config);

      expect(dataBus.listenerCount('pose:detected')).toBe(1);
    });

    it('should not subscribe to Data Bus when disabled', () => {
      const config = { api: { enabled: false } };

      apiModule = new ApiModule(dataBus, config);

      expect(dataBus.listenerCount('pose:detected')).toBe(0);
    });
  });

  describe('Pose Data Forwarding', () => {
    beforeEach(() => {
      const config = { api: { enabled: true } };
      apiModule = new ApiModule(dataBus, config);
    });

    it('should send pose update when pose is detected', async () => {
      const poseData = {
        detected: true,
        pose: {
          normalized: [{ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }],
          pixel: [{ x: 320, y: 240, z: 0, visibility: 0.9 }]
        },
        fps: 30
      };

      dataBus.emitPoseDetected(poseData);

      // Wait for async fetch
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/pose/update',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.detected).toBe(true);
      expect(callBody.pose).toBeDefined();
      expect(callBody.fps).toBe(30);
      expect(callBody.timestamp).toBeDefined();
    });

    it('should not send when disabled', async () => {
      apiModule.disable();

      const poseData = { detected: true, pose: {}, fps: 30 };
      dataBus.emitPoseDetected(poseData);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle pose lost (detected: false)', async () => {
      const poseData = {
        detected: false,
        pose: null,
        fps: 30
      };

      dataBus.emitPoseDetected(poseData);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.detected).toBe(false);
      expect(callBody.pose).toBeNull();
    });

    it('should handle missing fps', async () => {
      const poseData = {
        detected: true,
        pose: {}
      };

      dataBus.emitPoseDetected(poseData);

      await new Promise(resolve => setTimeout(resolve, 0));

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.fps).toBeNull();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      const config = { api: { enabled: true } };
      apiModule = new ApiModule(dataBus, config);
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const poseData = { detected: true, pose: {}, fps: 30 };
      dataBus.emitPoseDetected(poseData);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(apiModule.failedAttempts).toBe(1);
      expect(apiModule.connected).toBe(true); // Still connected after 1 failure
    });

    it('should disable after max failed attempts', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const poseData = { detected: true, pose: {}, fps: 30 };

      // Emit 3 times to reach max failed attempts
      for (let i = 0; i < 3; i++) {
        dataBus.emitPoseDetected(poseData);
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      expect(apiModule.failedAttempts).toBe(3);
      expect(apiModule.connected).toBe(false);
    });

    it('should reset failed attempts on success', async () => {
      // Fail once
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const poseData = { detected: true, pose: {}, fps: 30 };
      dataBus.emitPoseDetected(poseData);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(apiModule.failedAttempts).toBe(1);

      // Succeed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      dataBus.emitPoseDetected(poseData);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(apiModule.failedAttempts).toBe(0);
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const poseData = { detected: true, pose: {}, fps: 30 };
      dataBus.emitPoseDetected(poseData);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(apiModule.failedAttempts).toBe(1);
    });
  });

  describe('Config Changes', () => {
    beforeEach(() => {
      const config = { api: { enabled: false } };
      apiModule = new ApiModule(dataBus, config);
    });

    it('should enable when config changes to enabled', () => {
      const newConfig = {
        api: {
          enabled: true,
          endpoints: { update: '/api/pose/update' }
        }
      };

      dataBus.emitConfigChanged(newConfig);

      expect(apiModule.enabled).toBe(true);
      expect(apiModule.connected).toBe(true);
      expect(apiModule.failedAttempts).toBe(0);
    });

    it('should disable when config changes to disabled', () => {
      // Enable first
      apiModule.enable();
      expect(apiModule.enabled).toBe(true);

      const newConfig = { api: { enabled: false } };
      dataBus.emitConfigChanged(newConfig);

      expect(apiModule.enabled).toBe(false);
      expect(apiModule.connected).toBe(false);
    });

    it('should update endpoint when config changes', () => {
      const newConfig = {
        api: {
          enabled: false,
          endpoints: { update: '/api/v2/pose/update' }
        }
      };

      dataBus.emitConfigChanged(newConfig);

      expect(apiModule.updateEndpoint).toBe('/api/v2/pose/update');
    });
  });

  describe('Manual Control', () => {
    beforeEach(() => {
      const config = { api: { enabled: false } };
      apiModule = new ApiModule(dataBus, config);
    });

    it('should enable via enable() method', () => {
      expect(apiModule.enabled).toBe(false);

      apiModule.enable();

      expect(apiModule.enabled).toBe(true);
      expect(apiModule.connected).toBe(true);
    });

    it('should disable via disable() method', () => {
      apiModule.enable();
      expect(apiModule.enabled).toBe(true);

      apiModule.disable();

      expect(apiModule.enabled).toBe(false);
      expect(apiModule.connected).toBe(false);
    });

    it('should not enable twice', () => {
      apiModule.enable();
      const firstSubscription = apiModule.unsubscribePose;

      apiModule.enable(); // Call again

      expect(apiModule.unsubscribePose).toBe(firstSubscription);
    });
  });

  describe('Status', () => {
    it('should return current status', () => {
      const config = { api: { enabled: true } };
      apiModule = new ApiModule(dataBus, config);

      const status = apiModule.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.failedAttempts).toBe(0);
      expect(status.endpoint).toBe('/api/pose/update');
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe on destroy', () => {
      const config = { api: { enabled: true } };
      apiModule = new ApiModule(dataBus, config);

      expect(dataBus.listenerCount('pose:detected')).toBe(1);

      apiModule.destroy();

      expect(dataBus.listenerCount('pose:detected')).toBe(0);
      expect(apiModule.connected).toBe(false);
      expect(apiModule.unsubscribePose).toBeNull();
    });
  });
});
