/**
 * Tests for StorageModule (Sprint 8)
 * Tests session recording, saving, loading, and replay functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageModule } from '../client/js/storageModule.js';
import { DataBus } from '../client/js/dataBus.js';

describe('StorageModule', () => {
  let storageModule;
  let dataBus;
  let mockConfig;
  let fetchMock;

  beforeEach(() => {
    // Mock configuration
    mockConfig = {
      enabled: true,
      format: 'json',
      sessionPath: './sessions',
      autoSave: false,
      autoSaveInterval: 300000,
      maxFramesInMemory: 10000,
      includeTimestamps: true,
      includeConfidence: true
    };

    // Create data bus
    dataBus = new DataBus();

    // Mock global fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    // Initialize storage module
    storageModule = new StorageModule(dataBus, mockConfig);
  });

  afterEach(() => {
    if (storageModule) {
      storageModule.destroy();
    }
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(storageModule.config).toEqual(mockConfig);
      expect(storageModule.dataBus).toBe(dataBus);
      expect(storageModule.recording).toBe(false);
      expect(storageModule.frames).toEqual([]);
    });

    it('should not start recording automatically', () => {
      expect(storageModule.recording).toBe(false);
    });
  });

  describe('Recording', () => {
    it('should start recording', () => {
      const emitSpy = vi.spyOn(dataBus, 'emit');

      storageModule.startRecording();

      expect(storageModule.recording).toBe(true);
      expect(storageModule.frames).toEqual([]);
      expect(storageModule.sessionStartTime).toBeDefined();
      expect(emitSpy).toHaveBeenCalledWith('session:started', expect.objectContaining({
        timestamp: expect.any(Number)
      }));
    });

    it('should stop recording', () => {
      const emitSpy = vi.spyOn(dataBus, 'emit');

      storageModule.startRecording();
      const result = storageModule.stopRecording();

      expect(storageModule.recording).toBe(false);
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('frameCount');
      expect(emitSpy).toHaveBeenCalledWith('session:stopped', expect.objectContaining({
        duration: expect.any(Number),
        frameCount: expect.any(Number)
      }));
    });

    it('should record frames when pose is detected', () => {
      storageModule.startRecording();

      const poseData = {
        timestamp: Date.now(),
        fps: 30,
        detected: true,
        pose: {
          normalized: [{ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }],
          pixel: [{ x: 320, y: 240, z: 0, visibility: 0.9 }]
        }
      };

      storageModule.recordFrame(poseData);

      expect(storageModule.frames).toHaveLength(1);
      expect(storageModule.frames[0]).toMatchObject({
        frameNumber: 0,
        timestamp: poseData.timestamp,
        detected: true
      });
      expect(storageModule.totalFrameCount).toBe(1);
      expect(storageModule.detectedFrameCount).toBe(1);
    });

    it('should record frames when pose is not detected', () => {
      storageModule.startRecording();

      const poseData = {
        timestamp: Date.now(),
        fps: 0,
        detected: false,
        pose: null
      };

      storageModule.recordFrame(poseData);

      expect(storageModule.frames).toHaveLength(1);
      expect(storageModule.frames[0]).toMatchObject({
        frameNumber: 0,
        detected: false,
        pose: null
      });
      expect(storageModule.totalFrameCount).toBe(1);
      expect(storageModule.detectedFrameCount).toBe(0);
    });

    it('should calculate detection rate correctly', () => {
      storageModule.startRecording();

      // Record 3 detected frames and 2 not detected
      for (let i = 0; i < 3; i++) {
        storageModule.recordFrame({
          timestamp: Date.now(),
          fps: 30,
          detected: true,
          pose: { normalized: [], pixel: [] }
        });
      }

      for (let i = 0; i < 2; i++) {
        storageModule.recordFrame({
          timestamp: Date.now(),
          fps: 0,
          detected: false,
          pose: null
        });
      }

      const rate = storageModule.calculateDetectionRate();
      expect(rate).toBe(0.6); // 3/5
    });

    it('should respect maxFramesInMemory limit', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      // Set low limit
      storageModule.config.maxFramesInMemory = 5;
      storageModule.startRecording();

      // Mock save method
      storageModule.saveSession = vi.fn().mockResolvedValue({});

      // Record 6 frames
      for (let i = 0; i < 6; i++) {
        storageModule.recordFrame({
          timestamp: Date.now(),
          fps: 30,
          detected: true,
          pose: { normalized: [], pixel: [] }
        });
      }

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Maximum frames'));
    });
  });

  describe('Session Building', () => {
    it('should build session with correct structure', () => {
      storageModule.startRecording();

      storageModule.recordFrame({
        timestamp: Date.now(),
        fps: 30,
        detected: true,
        pose: { normalized: [], pixel: [] }
      });

      storageModule.stopRecording();

      const session = storageModule.buildSession();

      expect(session).toHaveProperty('sessionId');
      expect(session).toHaveProperty('startTime');
      expect(session).toHaveProperty('endTime');
      expect(session).toHaveProperty('duration');
      expect(session).toHaveProperty('config');
      expect(session).toHaveProperty('frames');
      expect(session).toHaveProperty('stats');

      expect(session.stats).toMatchObject({
        totalFrames: expect.any(Number),
        detectedFrames: expect.any(Number),
        averageFps: expect.any(Number),
        detectionRate: expect.any(Number)
      });
    });

    it('records the capture resolution and includes it in the session config', () => {
      storageModule.startRecording();

      // Detected frames carry the video frame dimensions; a pose:lost frame
      // (no width/height) must not clobber the sampled resolution.
      storageModule.recordFrame({
        timestamp: Date.now(), fps: 30, detected: true,
        width: 1280, height: 720,
        pose: { normalized: [], pixel: [] }
      });
      storageModule.recordFrame({
        timestamp: Date.now(), fps: 0, detected: false, pose: null
      });

      const session = storageModule.buildSession();
      expect(session.config.resolution).toEqual({ width: 1280, height: 720 });
    });

    it('leaves session resolution null when frames carry no dimensions (legacy capture)', () => {
      storageModule.startRecording();
      storageModule.recordFrame({
        timestamp: Date.now(), fps: 30, detected: true,
        pose: { normalized: [], pixel: [] }
      });

      const session = storageModule.buildSession();
      expect(session.config.resolution).toBeNull();
    });

    it('should generate valid session ID with timestamp', () => {
      const sessionId = storageModule.generateSessionId();
      expect(sessionId).toMatch(/^session-\d{8}-\d{6}$/);
    });

    it('should generate autosave session ID', () => {
      const sessionId = storageModule.generateSessionId(true);
      expect(sessionId).toMatch(/^autosave-\d{8}-\d{6}$/);
    });
  });

  describe('CSV Conversion', () => {
    it('should convert session to CSV format', () => {
      const session = {
        sessionId: 'test-session',
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        duration: 1000,
        frames: [
          {
            frameNumber: 0,
            timestamp: Date.now(),
            fps: 30,
            detected: true,
            pose: {
              normalized: Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })
            }
          },
          {
            frameNumber: 1,
            timestamp: Date.now() + 33,
            fps: 30,
            detected: false,
            pose: null
          }
        ]
      };

      const csv = storageModule.convertToCSV(session);

      expect(csv).toContain('frameNumber,timestamp,fps,detected');
      expect(csv).toContain('0,');
      expect(csv).toContain('1,');

      const lines = csv.split('\n');
      expect(lines.length).toBe(3); // Header + 2 data rows
    });
  });

  describe('Saving Sessions', () => {
    it('should save session as JSON', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          filename: 'session-test.json',
          path: '/sessions/session-test.json',
          size: 1234
        })
      });

      storageModule.startRecording();
      storageModule.recordFrame({
        timestamp: Date.now(),
        fps: 30,
        detected: true,
        pose: { normalized: [], pixel: [] }
      });
      storageModule.stopRecording();

      const result = await storageModule.saveJSON(storageModule.buildSession());

      expect(result).toMatchObject({
        filename: expect.any(String),
        format: 'json'
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/session/save',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('should save session as CSV', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          filename: 'session-test.csv',
          path: '/sessions/session-test.csv',
          size: 5678
        })
      });

      storageModule.startRecording();
      storageModule.recordFrame({
        timestamp: Date.now(),
        fps: 30,
        detected: true,
        pose: { normalized: [], pixel: [] }
      });
      storageModule.stopRecording();

      const result = await storageModule.saveCSV(storageModule.buildSession());

      expect(result).toMatchObject({
        filename: expect.any(String),
        format: 'csv'
      });
    });

    it('should throw error when saving empty session', async () => {
      await expect(storageModule.saveSession('json')).rejects.toThrow('No frames to save');
    });

    it('should emit session:saved event', async () => {
      const emitSpy = vi.spyOn(dataBus, 'emit');

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, filename: 'test.json', path: '/test.json', size: 100 })
      });

      storageModule.startRecording();
      storageModule.recordFrame({
        timestamp: Date.now(),
        fps: 30,
        detected: true,
        pose: { normalized: [], pixel: [] }
      });
      storageModule.stopRecording();

      await storageModule.saveSession('json');

      expect(emitSpy).toHaveBeenCalledWith('session:saved', expect.objectContaining({
        sessionId: expect.any(String),
        format: 'json'
      }));
    });
  });

  describe('Loading Sessions', () => {
    it('should load session from file', async () => {
      const mockSession = {
        sessionId: 'loaded-session',
        startTime: Date.now(),
        endTime: Date.now() + 60000,
        duration: 60000,
        frames: [{ frameNumber: 0, timestamp: Date.now(), detected: true }],
        stats: { totalFrames: 1, detectedFrames: 1, averageFps: 30, detectionRate: 1.0 }
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => mockSession
      });

      const result = await storageModule.loadSession('test-session.json');

      expect(result).toEqual(mockSession);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/session/load')
      );
    });

    it('should emit session:loaded event', async () => {
      const emitSpy = vi.spyOn(dataBus, 'emit');

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          sessionId: 'test',
          frames: [{}]
        })
      });

      await storageModule.loadSession('test.json');

      expect(emitSpy).toHaveBeenCalledWith('session:loaded', expect.objectContaining({
        sessionId: 'test',
        frameCount: 1
      }));
    });
  });

  describe('Replay', () => {
    it('should start replay', () => {
      const emitSpy = vi.spyOn(dataBus, 'emit');
      const session = {
        sessionId: 'replay-test',
        frames: [
          { frameNumber: 0, timestamp: 1000, detected: true, pose: {}, fps: 30 },
          { frameNumber: 1, timestamp: 1033, detected: true, pose: {}, fps: 30 }
        ]
      };

      storageModule.replay(session, 1.0);

      expect(storageModule.replaying).toBe(true);
      expect(emitSpy).toHaveBeenCalledWith('replay:started', expect.objectContaining({
        sessionId: 'replay-test',
        frameCount: 2
      }));
    });

    it('should stop replay', () => {
      const emitSpy = vi.spyOn(dataBus, 'emit');
      const session = {
        sessionId: 'replay-test',
        frames: [{ frameNumber: 0, timestamp: 1000, detected: true, pose: {}, fps: 30 }]
      };

      storageModule.replay(session, 1.0);
      storageModule.stopReplay();

      expect(storageModule.replaying).toBe(false);
      expect(emitSpy).toHaveBeenCalledWith('replay:stopped', expect.any(Object));
    });

    it('should emit pose events during replay', (done) => {
      const poseEmitSpy = vi.spyOn(dataBus, 'emit');
      const session = {
        sessionId: 'replay-test',
        frames: [
          { frameNumber: 0, timestamp: 1000, detected: true, pose: { test: true }, fps: 30 }
        ]
      };

      storageModule.replay(session, 10.0); // Fast speed for test

      setTimeout(() => {
        expect(poseEmitSpy).toHaveBeenCalledWith('pose:detected', expect.objectContaining({
          detected: true
        }));
        storageModule.stopReplay();
        done();
      }, 100);
    });

    it('should handle no-detect frames during replay', (done) => {
      const emitSpy = vi.spyOn(dataBus, 'emit');
      const session = {
        sessionId: 'replay-test',
        frames: [
          { frameNumber: 0, timestamp: 1000, detected: false, pose: null, fps: 0 }
        ]
      };

      storageModule.replay(session, 10.0);

      setTimeout(() => {
        expect(emitSpy).toHaveBeenCalledWith('pose:lost');
        storageModule.stopReplay();
        done();
      }, 100);
    });

    it('re-attaches the recorded resolution to replayed pose events (canvas sizing)', () => {
      // Frame 0 is emitted synchronously inside replay(), so no timer needed.
      const emitSpy = vi.spyOn(dataBus, 'emit');
      const session = {
        sessionId: 'replay-res-test',
        config: { resolution: { width: 1280, height: 720 } },
        frames: [{ frameNumber: 0, timestamp: 1000, detected: true, pose: { test: true }, fps: 30 }]
      };

      storageModule.replay(session, 1.0);

      expect(emitSpy).toHaveBeenCalledWith('pose:detected', expect.objectContaining({
        detected: true,
        width: 1280,
        height: 720
      }));

      storageModule.stopReplay();
    });

    it('omits width/height when the session stored no resolution (legacy session)', () => {
      const emitSpy = vi.spyOn(dataBus, 'emit');
      const session = {
        sessionId: 'replay-legacy-test',
        frames: [{ frameNumber: 0, timestamp: 1000, detected: true, pose: { test: true }, fps: 30 }]
      };

      storageModule.replay(session, 1.0);

      const poseCall = emitSpy.mock.calls.find((c) => c[0] === 'pose:detected');
      expect(poseCall).toBeTruthy();
      expect(poseCall[1]).not.toHaveProperty('width');
      expect(poseCall[1]).not.toHaveProperty('height');

      storageModule.stopReplay();
    });

    it('pauses without advancing and resumes from the same frame', () => {
      const emitSpy = vi.spyOn(dataBus, 'emit');
      const session = {
        sessionId: 'pause-test',
        config: { resolution: { width: 640, height: 480 } },
        frames: [
          { frameNumber: 0, timestamp: 1000, detected: true, pose: { id: 0 }, fps: 30 },
          { frameNumber: 1, timestamp: 1033, detected: true, pose: { id: 1 }, fps: 30 },
          { frameNumber: 2, timestamp: 1066, detected: true, pose: { id: 2 }, fps: 30 }
        ]
      };

      // Frame 0 emits synchronously; the next frame is queued on a timer.
      storageModule.replay(session, 1.0);
      expect(storageModule.currentReplayFrame).toBe(1);

      storageModule.pauseReplay();
      expect(storageModule.replaying).toBe(true);      // still an active (paused) replay
      expect(storageModule.replayPaused).toBe(true);
      expect(storageModule.replayTimer).toBeNull();    // queued frame cancelled
      expect(storageModule.currentReplayFrame).toBe(1); // position preserved
      const callsWhilePaused = emitSpy.mock.calls.length;

      storageModule.resumeReplay();
      expect(emitSpy).toHaveBeenCalledWith('replay:resumed', expect.objectContaining({ currentFrame: 1 }));
      // Resume emits frame 1 WITH the recorded resolution AND a progress event —
      // the two things the old duplicate resume loop silently dropped.
      expect(emitSpy).toHaveBeenCalledWith('pose:detected', expect.objectContaining({
        pose: { id: 1 }, width: 640, height: 480
      }));
      expect(emitSpy).toHaveBeenCalledWith('replay:progress', expect.objectContaining({ currentFrame: 1 }));
      expect(emitSpy.mock.calls.length).toBeGreaterThan(callsWhilePaused);
      expect(storageModule.replayPaused).toBe(false);
      expect(storageModule.currentReplayFrame).toBe(2);

      storageModule.stopReplay();
    });

    it('pauseReplay is a no-op when not replaying or already paused', () => {
      const emitSpy = vi.spyOn(dataBus, 'emit');

      storageModule.pauseReplay(); // not replaying
      expect(emitSpy).not.toHaveBeenCalledWith('replay:paused', expect.anything());

      const session = {
        sessionId: 's',
        frames: [{ frameNumber: 0, timestamp: 1000, detected: true, pose: {}, fps: 30 }]
      };
      storageModule.replay(session, 1.0);
      storageModule.pauseReplay();
      emitSpy.mockClear();
      storageModule.pauseReplay(); // already paused
      expect(emitSpy).not.toHaveBeenCalledWith('replay:paused', expect.anything());

      storageModule.stopReplay();
    });

    it('resumeReplay is a no-op unless paused', () => {
      const session = {
        sessionId: 's',
        frames: [
          { frameNumber: 0, timestamp: 1000, detected: true, pose: {}, fps: 30 },
          { frameNumber: 1, timestamp: 1033, detected: true, pose: {}, fps: 30 }
        ]
      };
      storageModule.replay(session, 1.0); // playing, not paused
      const emitSpy = vi.spyOn(dataBus, 'emit');
      storageModule.resumeReplay();
      expect(emitSpy).not.toHaveBeenCalledWith('replay:resumed', expect.anything());
      storageModule.stopReplay();
    });

    it('stopReplay clears paused state and the held session', () => {
      const session = {
        sessionId: 's',
        frames: [
          { frameNumber: 0, timestamp: 1000, detected: true, pose: {}, fps: 30 },
          { frameNumber: 1, timestamp: 1033, detected: true, pose: {}, fps: 30 }
        ]
      };
      storageModule.replay(session, 1.0);
      storageModule.pauseReplay();
      storageModule.stopReplay();

      expect(storageModule.replaying).toBe(false);
      expect(storageModule.replayPaused).toBe(false);
      expect(storageModule.replaySession).toBeNull();

      // A subsequent resume does nothing — there's no active replay to continue.
      const emitSpy = vi.spyOn(dataBus, 'emit');
      storageModule.resumeReplay();
      expect(emitSpy).not.toHaveBeenCalledWith('replay:resumed', expect.anything());
    });
  });

  describe('Status', () => {
    it('should return current status', () => {
      storageModule.startRecording();

      const status = storageModule.getStatus();

      expect(status).toMatchObject({
        recording: true,
        replaying: false,
        frameCount: 0,
        detectedFrames: 0,
        totalFrames: 0,
        detectionRate: 0,
        sessionStartTime: expect.any(Number)
      });
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on destroy', () => {
      storageModule.startRecording();
      storageModule.destroy();

      expect(storageModule.recording).toBe(false);
      expect(storageModule.frames).toEqual([]);
    });
  });
});
