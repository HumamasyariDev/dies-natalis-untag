/**
 * Integration tests for PoseDetectionApp
 * Tests the complete pipeline: Webcam → Detector → Filter → DataBus → Display
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PoseDetectionApp } from '../client/js/main.js';
import { StorageModule } from '../client/js/storageModule.js';

// Mock DOM elements
function createMockDOM() {
  const mockVideo = {
    videoWidth: 640,
    videoHeight: 480,
    srcObject: null,
    play: vi.fn(async function() {
      // Simulate successful play
      return Promise.resolve();
    }),
    set onloadedmetadata(handler) {
      // Immediately trigger the handler to simulate metadata loaded
      if (handler) {
        setTimeout(() => handler(), 0);
      }
    },
    get onloadedmetadata() {
      return null;
    },
    onerror: null
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn()
    }))
  };

  const mockStartBtn = {
    disabled: false,
    addEventListener: vi.fn()
  };

  const mockStopBtn = {
    disabled: false,
    addEventListener: vi.fn()
  };

  const mockModelSelect = {
    value: 'full',
    addEventListener: vi.fn()
  };

  const mockDisplayModeSelect = {
    value: 'overlay',
    addEventListener: vi.fn()
  };

  const mockFpsDisplay = {
    textContent: ''
  };

  const mockStatusDisplay = {
    textContent: ''
  };

  const mockResolutionSelect = {
    value: '1280x720',
    addEventListener: vi.fn()
  };

  const mockCameraSelect = {
    value: '',
    innerHTML: '',
    addEventListener: vi.fn()
  };

  // The display container whose aspect ratio initWebcam drives from the stream.
  const mockVideoContainer = {
    style: {}
  };

  const mockDocument = {
    getElementById: vi.fn((id) => {
      const elements = {
        'webcam': mockVideo,
        'output-canvas': mockCanvas,
        'video-container': mockVideoContainer,
        'start-btn': mockStartBtn,
        'stop-btn': mockStopBtn,
        'model-select': mockModelSelect,
        'resolution-select': mockResolutionSelect,
        'camera-select': mockCameraSelect,
        'display-mode': mockDisplayModeSelect,
        'fps-display': mockFpsDisplay,
        'status-display': mockStatusDisplay
      };
      return elements[id];
    }),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn()
  };

  vi.stubGlobal('document', mockDocument);
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => {
    setTimeout(cb, 16);
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  return {
    mockVideo,
    mockCanvas,
    mockVideoContainer,
    mockStartBtn,
    mockStopBtn,
    mockModelSelect,
    mockResolutionSelect,
    mockCameraSelect,
    mockDisplayModeSelect,
    mockFpsDisplay,
    mockStatusDisplay
  };
}

// Mock fetch for config
function mockFetch() {
  const fetchMock = vi.fn((url) => {
    if (url === '/api/config') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          detector: {
            modelPath: './models/pose_landmarker_full.task',
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
          input: {
            source: 'webcam',
            webcamId: 0,
            deviceId: null,
            resolution: { width: 1280, height: 720 }
          },
          filtering: {
            enabled: true,
            type: 'oneEuro',
            oneEuroConfig: {
              minCutoff: 1.0,
              beta: 0.007,
              dCutoff: 1.0
            }
          },
          coordinates: {
            normalized: true,
            pixel: true,
            world: false
          },
          display: {
            enabled: true,
            mode: 'overlay',
            overlay: {
              showWebcam: true,
              showSkeleton: true,
              showKeypoints: true,
              keypointRadius: 5,
              lineWidth: 2,
              confidenceColorCoding: false
            },
            stickFigure: {
              backgroundColor: '#000000',
              figureColor: '#00FF00',
              showKeypoints: true
            },
            keypoints: {
              showAll: true,
              visibleJoints: 'all',
              radius: 5
            }
          }
        })
      });
    }
    return Promise.reject(new Error('Not found'));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Mock getUserMedia
function mockGetUserMedia() {
  const mockTrack = {
    stop: vi.fn(),
    getSettings: vi.fn(() => ({ width: 640, height: 480, frameRate: 30, deviceId: 'cam-default' })),
    getCapabilities: vi.fn(() => ({ frameRate: { max: 60 } }))
  };
  const mockStream = {
    getTracks: vi.fn(() => [mockTrack]),
    getVideoTracks: vi.fn(() => [mockTrack])
  };

  const mockNavigator = {
    mediaDevices: {
      getUserMedia: vi.fn(async (constraints) => {
        return mockStream;
      }),
      enumerateDevices: vi.fn(async () => ([
        { kind: 'videoinput', deviceId: 'cam-default', label: 'Built-in Webcam' },
        { kind: 'videoinput', deviceId: 'cam-usb', label: 'Logitech BRIO' },
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in Mic' }
      ])),
      addEventListener: vi.fn()
    }
  };

  vi.stubGlobal('navigator', mockNavigator);

  return mockStream;
}

// Mock performance.now
function mockPerformance() {
  let time = 0;
  const mockPerf = {
    now: vi.fn(() => {
      time += 16.67; // ~60 FPS
      return time;
    })
  };
  vi.stubGlobal('performance', mockPerf);
  return mockPerf;
}

describe('PoseDetectionApp', () => {
  let app;
  let mockDOM;
  let mockStream;

  beforeEach(() => {
    mockDOM = createMockDOM();
    mockFetch();
    mockStream = mockGetUserMedia();
    mockPerformance();

    // Mock console methods to reduce noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (app && app.isRunning) {
      app.stop();
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Initialization', () => {
    it('should create app instance', () => {
      app = new PoseDetectionApp();
      expect(app).toBeDefined();
      expect(app.config).toBeNull();
      expect(app.detector).toBeNull();
      expect(app.isRunning).toBe(false);
    });

    it('should initialize with config', async () => {
      app = new PoseDetectionApp();
      await app.init();

      expect(app.config).toBeDefined();
      expect(app.config.detector.modelPath).toBe('./models/pose_landmarker_full.task');
      expect(app.dataBus).toBeDefined();
      expect(app.displayModule).toBeDefined();
    });

    it('should use default config if fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network error'))));

      app = new PoseDetectionApp();
      await app.init();

      expect(app.config).toBeDefined();
      expect(app.config.detector.modelPath).toBe('./models/pose_landmarker_full.task');
    });

    it('should set up UI listeners', async () => {
      app = new PoseDetectionApp();
      await app.init();

      const startBtn = document.getElementById('start-btn');
      const stopBtn = document.getElementById('stop-btn');
      const modelSelect = document.getElementById('model-select');
      const displayModeSelect = document.getElementById('display-mode');

      expect(startBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
      expect(stopBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
      expect(modelSelect.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(displayModeSelect.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should subscribe to FPS updates', async () => {
      app = new PoseDetectionApp();
      await app.init();

      const fpsDisplay = document.getElementById('fps-display');
      app.dataBus.emitFpsUpdate({ fps: 30.5, timestamp: 1000 });

      expect(fpsDisplay.textContent).toBe('FPS: 30.5');
    });
  });

  describe('Configuration', () => {
    it('should update model path when model selector changes', async () => {
      app = new PoseDetectionApp();
      await app.init();

      const modelSelect = document.getElementById('model-select');
      const changeHandler = modelSelect.addEventListener.mock.calls.find(
        call => call[0] === 'change'
      )[1];

      changeHandler({ target: { value: 'lite' } });
      expect(app.config.detector.modelPath).toBe('./models/pose_landmarker_lite.task');

      changeHandler({ target: { value: 'heavy' } });
      expect(app.config.detector.modelPath).toBe('./models/pose_landmarker_heavy.task');
    });

    it('should update capture resolution when resolution selector changes', async () => {
      app = new PoseDetectionApp();
      await app.init();

      const resolutionSelect = document.getElementById('resolution-select');
      const changeHandler = resolutionSelect.addEventListener.mock.calls.find(
        call => call[0] === 'change'
      )[1];

      changeHandler({ target: { value: '1920x1080' } });
      expect(app.config.input.resolution).toEqual({ width: 1920, height: 1080 });

      changeHandler({ target: { value: '640x480' } });
      expect(app.config.input.resolution).toEqual({ width: 640, height: 480 });
    });

    it('should update the selected camera deviceId when the camera selector changes', async () => {
      app = new PoseDetectionApp();
      await app.init();

      const cameraSelect = document.getElementById('camera-select');
      const changeHandler = cameraSelect.addEventListener.mock.calls.find(
        call => call[0] === 'change'
      )[1];

      changeHandler({ target: { value: 'cam-usb' } });
      expect(app.config.input.deviceId).toBe('cam-usb');

      // Empty value means "browser default" -> no deviceId pin.
      changeHandler({ target: { value: '' } });
      expect(app.config.input.deviceId).toBeNull();
    });

    it('should update display mode when mode selector changes', async () => {
      app = new PoseDetectionApp();
      await app.init();

      const displayModeSelect = document.getElementById('display-mode');
      const changeHandler = displayModeSelect.addEventListener.mock.calls.find(
        call => call[0] === 'change'
      )[1];

      app.displayModule.setMode = vi.fn();

      changeHandler({ target: { value: 'stickFigure' } });
      expect(app.config.display.mode).toBe('stickFigure');
      expect(app.displayModule.setMode).toHaveBeenCalledWith('stickFigure');
    });
  });

  describe('Webcam Access', () => {
    it('should initialize webcam successfully', async () => {
      app = new PoseDetectionApp();
      await app.init();
      await app.initWebcam();

      // Default mode is steady-30: resolution pinned exact + an ADVISORY ideal
      // frame rate (no `min` — forcing a high rate is what collapses FPS in dim
      // light). 60 fps is opt-in (see the bright-light test below).
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: {
          width: { exact: 1280 },
          height: { exact: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user'
        },
        audio: false
      });

      expect(app.videoElement.srcObject).toBe(mockStream);
    });

    it('should force a high-rate mode when frameRate is 60 (bright-light opt-in)', async () => {
      app = new PoseDetectionApp();
      await app.init();
      app.config.input.frameRate = 60;

      await app.initWebcam();

      // Opt-in 60: first attempt forces a high-rate mode with a `min` above 30 —
      // the only way to pull a 60 fps mode out of the browser.
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: {
          width: { exact: 1280 },
          height: { exact: 720 },
          frameRate: { min: 45, ideal: 60 },
          facingMode: 'user'
        },
        audio: false
      });
    });

    it('should handle camera permission denied', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';
      navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.reject(permissionError));

      app = new PoseDetectionApp();
      await app.init();

      await expect(app.initWebcam()).rejects.toThrow('Camera permission denied');
    });

    it('should handle no camera found', async () => {
      const notFoundError = new Error('No camera');
      notFoundError.name = 'NotFoundError';
      navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.reject(notFoundError));

      app = new PoseDetectionApp();
      await app.init();

      await expect(app.initWebcam()).rejects.toThrow('No camera found');
    });

    it('should handle camera already in use', async () => {
      const inUseError = new Error('Camera busy');
      inUseError.name = 'NotReadableError';
      navigator.mediaDevices.getUserMedia = vi.fn(() => Promise.reject(inUseError));

      app = new PoseDetectionApp();
      await app.init();

      await expect(app.initWebcam()).rejects.toThrow('Camera is already in use');
    });

    it('should handle getUserMedia not supported', async () => {
      vi.stubGlobal('navigator', {});

      app = new PoseDetectionApp();
      await app.init();

      await expect(app.initWebcam()).rejects.toThrow('getUserMedia is not supported');
    });

    it('should set canvas size to match video', async () => {
      app = new PoseDetectionApp();
      await app.init();
      await app.initWebcam();

      expect(app.canvasElement.width).toBe(640);
      expect(app.canvasElement.height).toBe(480);
    });

    it('should request the configured capture resolution', async () => {
      app = new PoseDetectionApp();
      await app.init();
      app.config.input.resolution = { width: 1920, height: 1080 };

      await app.initWebcam();

      // The chosen resolution is pinned exact on the first (preferred) attempt.
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: {
          width: { exact: 1920 },
          height: { exact: 1080 },
          frameRate: { ideal: 30 },
          facingMode: 'user'
        },
        audio: false
      });
    });

    it('falls back to a looser request when the exact resolution is unavailable', async () => {
      app = new PoseDetectionApp();
      await app.init();

      const overconstrained = new Error('cannot satisfy constraints');
      overconstrained.name = 'OverconstrainedError';
      const gum = vi.fn()
        .mockRejectedValueOnce(overconstrained) // attempt 1: exact res
        .mockResolvedValueOnce(mockStream);      // attempt 2: ideal (loose) res
      navigator.mediaDevices.getUserMedia = gum;

      await app.initWebcam();

      expect(gum).toHaveBeenCalledTimes(2);
      // Loosened to ideal resolution, still the advisory steady-30 frame rate.
      expect(gum.mock.calls[1][0].video.frameRate).toEqual({ ideal: 30 });
      expect(gum.mock.calls[1][0].video.width).toEqual({ ideal: 1280 });
      expect(app.stream).toBe(mockStream);
    });

    it('does not retry looser constraints on a permission error (terminal)', async () => {
      app = new PoseDetectionApp();
      await app.init();

      const denied = new Error('Permission denied');
      denied.name = 'NotAllowedError';
      const gum = vi.fn().mockRejectedValue(denied);
      navigator.mediaDevices.getUserMedia = gum;

      await expect(app.initWebcam()).rejects.toThrow('Camera permission denied');
      // Terminal error: only one attempt, no fallback loop.
      expect(gum).toHaveBeenCalledTimes(1);
    });

    it('should set the container aspect ratio from the actual video dimensions', async () => {
      app = new PoseDetectionApp();
      await app.init();
      await app.initWebcam();

      // mockVideo reports 640x480, so the container must match (not the CSS 4:3
      // default) — this is what keeps the skeleton from being squished.
      expect(mockDOM.mockVideoContainer.style.aspectRatio).toBe('640 / 480');
    });

    it('should populate the camera selector from the enumerated video inputs', async () => {
      app = new PoseDetectionApp();
      await app.init(); // init() calls refreshCameras()

      const html = mockDOM.mockCameraSelect.innerHTML;
      expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();
      expect(html).toContain('Built-in Webcam');
      expect(html).toContain('Logitech BRIO');
      expect(html).toContain('cam-usb');
      // Audio inputs are excluded.
      expect(html).not.toContain('Built-in Mic');
    });

    it('should pin the selected camera via deviceId in the constraints', async () => {
      app = new PoseDetectionApp();
      await app.init();
      app.config.input.deviceId = 'cam-usb';

      await app.initWebcam();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: {
          deviceId: { exact: 'cam-usb' },
          width: { exact: 1280 },
          height: { exact: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });
    });
  });

  describe('Start/Stop Lifecycle', () => {
    it('should prevent multiple starts', async () => {
      app = new PoseDetectionApp();
      await app.init();

      // Manually set running state
      app.isRunning = true;

      // Try to start when already running
      const consoleSpy = vi.spyOn(console, 'warn');
      await app.start();
      expect(consoleSpy).toHaveBeenCalledWith('Detection already running');
    });

    it('should stop detection and clean up resources', async () => {
      app = new PoseDetectionApp();
      await app.init();

      app.stream = mockStream;
      app.isRunning = true;
      app.animationFrameId = 123;
      app.displayModule.stop = vi.fn();

      app.stop();

      expect(app.isRunning).toBe(false);
      expect(cancelAnimationFrame).toHaveBeenCalledWith(123);
      expect(mockStream.getTracks()[0].stop).toHaveBeenCalled();
      expect(app.stream).toBeNull();
      expect(app.displayModule.stop).toHaveBeenCalled();
    });

    it('should update UI state on stop', async () => {
      app = new PoseDetectionApp();
      await app.init();

      app.isRunning = true;
      app.stop();

      const startBtn = document.getElementById('start-btn');
      const stopBtn = document.getElementById('stop-btn');
      const fpsDisplay = document.getElementById('fps-display');
      const statusDisplay = document.getElementById('status-display');

      expect(startBtn.disabled).toBe(false);
      expect(stopBtn.disabled).toBe(true);
      expect(fpsDisplay.textContent).toBe('FPS: --');
      expect(statusDisplay.textContent).toBe('Status: Stopped');
    });

    it('should not error when stopping if not running', async () => {
      app = new PoseDetectionApp();
      await app.init();

      expect(app.isRunning).toBe(false);
      expect(() => app.stop()).not.toThrow();
    });
  });

  describe('Status Updates', () => {
    it('should update status display', async () => {
      app = new PoseDetectionApp();
      await app.init();

      const statusDisplay = document.getElementById('status-display');

      app.updateStatus('Test message');
      expect(statusDisplay.textContent).toBe('Status: Test message');

      app.updateStatus('Another message');
      expect(statusDisplay.textContent).toBe('Status: Another message');
    });

    it('should handle missing status display gracefully', () => {
      app = new PoseDetectionApp();
      app.statusDisplay = null;

      expect(() => app.updateStatus('Test')).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network error'))));
      const mockDoc = { getElementById: vi.fn(() => null), addEventListener: vi.fn() };
      vi.stubGlobal('document', mockDoc); // Simulate missing elements

      app = new PoseDetectionApp();

      // Should not throw, but log error
      await app.init();
      expect(console.error).toHaveBeenCalled();
    });

    it('should clean up on start error', async () => {
      app = new PoseDetectionApp();
      await app.init();

      app.initWebcam = vi.fn().mockRejectedValue(new Error('Webcam error'));

      await app.start();

      expect(app.isRunning).toBe(false);
      expect(app.startBtn.disabled).toBe(false);
      expect(app.stopBtn.disabled).toBe(true);
    });
  });

  describe('Integration - Full Pipeline', () => {
    it('should wire detector output to filter pipeline to data bus', async () => {
      app = new PoseDetectionApp();
      await app.init();

      // Mock detector
      const mockDetectionResult = {
        timestamp: 1000,
        fps: 30,
        detected: true,
        pose: {
          normalized: [{ index: 0, name: 'nose', x: 0.5, y: 0.5, z: 0, visibility: 0.9, presence: 0.95 }],
          pixel: [{ index: 0, name: 'nose', x: 320, y: 240, z: 0, visibility: 0.9, presence: 0.95 }]
        }
      };

      app.detector = {
        initialize: vi.fn().mockResolvedValue(undefined),
        detect: vi.fn().mockResolvedValue(mockDetectionResult)
      };

      app.filterPipeline = {
        process: vi.fn((result) => result) // Pass-through for test
      };

      // Spy on data bus
      const poseDetectedSpy = vi.fn();
      app.dataBus.onPoseDetected(poseDetectedSpy);

      app.isRunning = true;
      app.lastFrameTime = 0;

      // Process one frame
      await app.processFrame();

      // Verify detector was called
      expect(app.detector.detect).toHaveBeenCalledWith(
        app.videoElement,
        expect.any(Number)
      );

      // Verify filter was called
      expect(app.filterPipeline.process).toHaveBeenCalledWith(mockDetectionResult);

      // Verify data bus received pose
      expect(poseDetectedSpy).toHaveBeenCalledWith(mockDetectionResult);
    });

    it('should render once per processed frame via the display module', async () => {
      // Regression guard for the render-on-data fix: rendering is driven by the
      // frame loop (one render() per processFrame), not by a separate
      // free-running rAF loop inside the display.
      app = new PoseDetectionApp();
      await app.init();

      app.detector = {
        detect: vi.fn().mockResolvedValue({ detected: false, timestamp: 0 })
      };
      app.displayModule.render = vi.fn();

      app.isRunning = true;
      app.lastFrameTime = 0;

      await app.processFrame();

      expect(app.displayModule.render).toHaveBeenCalledTimes(1);
    });

    it('should emit pose:lost when no pose detected', async () => {
      app = new PoseDetectionApp();
      await app.init();

      app.detector = {
        detect: vi.fn().mockResolvedValue({
          timestamp: 1000,
          fps: 30,
          detected: false,
          pose: null
        })
      };

      const poseLostSpy = vi.fn();
      app.dataBus.onPoseLost(poseLostSpy);

      app.isRunning = true;
      app.lastFrameTime = 0;

      await app.processFrame();

      expect(poseLostSpy).toHaveBeenCalledWith({ timestamp: expect.any(Number) });
    });

    it('should calculate and emit FPS updates', async () => {
      app = new PoseDetectionApp();
      await app.init();

      app.detector = {
        detect: vi.fn().mockResolvedValue({ detected: false, timestamp: 0 })
      };

      const fpsUpdateSpy = vi.fn();
      app.dataBus.onFpsUpdate(fpsUpdateSpy);

      app.isRunning = true;
      app.lastFrameTime = 0;
      app.frameCount = 0;

      // Simulate processing frames over more than 1 second
      let currentTime = 0;
      for (let i = 0; i <= 35; i++) {
        currentTime = i * 33.33; // ~30 FPS
        performance.now = vi.fn(() => currentTime);
        await app.processFrame();

        // Stop after FPS update is emitted
        if (fpsUpdateSpy.mock.calls.length > 0) {
          break;
        }
      }

      // Should emit FPS update after ~1 second
      expect(fpsUpdateSpy).toHaveBeenCalled();
      const fpsData = fpsUpdateSpy.mock.calls[0][0];
      expect(fpsData.fps).toBeGreaterThan(0);
    });

    it('should continue processing on frame errors', async () => {
      app = new PoseDetectionApp();
      await app.init();

      app.detector = {
        detect: vi.fn()
          .mockRejectedValueOnce(new Error('Detection error'))
          .mockResolvedValueOnce({ detected: false, timestamp: 0 })
      };

      app.isRunning = true;
      app.lastFrameTime = 0;

      // First call should error but not throw
      await app.processFrame();
      expect(console.error).toHaveBeenCalled();

      // Second call should succeed
      await app.processFrame();
      expect(app.detector.detect).toHaveBeenCalledTimes(2);
    });

    it('should skip filtering when disabled', async () => {
      app = new PoseDetectionApp();
      await app.init();

      app.config.filtering.enabled = false;

      const mockDetectionResult = {
        timestamp: 1000,
        detected: true,
        pose: { normalized: [], pixel: [] }
      };

      app.detector = {
        detect: vi.fn().mockResolvedValue(mockDetectionResult)
      };

      app.filterPipeline = {
        process: vi.fn()
      };

      const poseDetectedSpy = vi.fn();
      app.dataBus.onPoseDetected(poseDetectedSpy);

      app.isRunning = true;
      app.lastFrameTime = 0;

      await app.processFrame();

      // Filter should not be called
      expect(app.filterPipeline.process).not.toHaveBeenCalled();

      // Raw detection result should be emitted
      expect(poseDetectedSpy).toHaveBeenCalledWith(mockDetectionResult);
    });
  });

  describe('Replay rendering', () => {
    it('drives exactly one display render per replayed frame', async () => {
      // Regression guard for the replay-render fix: after Stop the display is
      // unsubscribed from the bus, so replayed pose events used to paint nothing.
      // main now re-subscribes the display during replay and renders once per
      // frame off replay:progress (mirroring processFrame()'s post-emit render),
      // without a free-running rAF loop.
      app = new PoseDetectionApp();
      await app.init();

      // init() skips the storage module (the test config has no `storage` block),
      // so attach a minimal one to exercise the real replay path through the bus.
      app.storageModule = new StorageModule(app.dataBus, {
        enabled: true,
        maxFramesInMemory: 1000
      });

      app.displayModule.render = vi.fn();

      const session = {
        sessionId: 'replay-render-test',
        frames: [{
          frameNumber: 0,
          detected: true,
          timestamp: 0,
          fps: 30,
          pose: { normalized: [], pixel: [] },
          angles: null
        }]
      };

      // replay() processes frame 0 synchronously (emits replay:started, then
      // pose:detected, then replay:progress) before scheduling the next frame.
      app.storageModule.replay(session, 1.0);

      // Exactly one render for the one replayed frame.
      expect(app.displayModule.render).toHaveBeenCalledTimes(1);

      // ...and the display was actually subscribed, so the replayed pose reached
      // it (not an empty render() against null pose data).
      expect(app.displayModule.currentPoseData).toMatchObject({ detected: true });
      expect(app.displayModule.currentPoseData.pose).toBe(session.frames[0].pose);

      app.storageModule.stopReplay(); // clear the pending next-frame timer

      // Stopping replay tears the display subscription back down.
      expect(app.replayDisplayUnsub).toBeNull();
    });

    it('Play resumes a paused replay instead of restarting it', async () => {
      app = new PoseDetectionApp();
      await app.init();
      app.storageModule = new StorageModule(app.dataBus, { enabled: true, maxFramesInMemory: 1000 });
      app.currentSession = {
        sessionId: 's',
        frames: [{ frameNumber: 0, timestamp: 0, detected: true, pose: {}, fps: 30 }]
      };

      app.storageModule.replay = vi.fn();
      app.storageModule.resumeReplay = vi.fn();
      app.storageModule.replaying = true;     // a replay is in progress...
      app.storageModule.replayPaused = true;  // ...and currently paused

      app.playReplay();

      expect(app.storageModule.resumeReplay).toHaveBeenCalledTimes(1);
      expect(app.storageModule.replay).not.toHaveBeenCalled();
    });

    it('Play starts a fresh replay when nothing is paused', async () => {
      app = new PoseDetectionApp();
      await app.init();
      app.storageModule = new StorageModule(app.dataBus, { enabled: true, maxFramesInMemory: 1000 });
      app.currentSession = {
        sessionId: 's',
        frames: [{ frameNumber: 0, timestamp: 0, detected: true, pose: {}, fps: 30 }]
      };
      app.replaySpeed = { value: '1.5' }; // not in the mock DOM; supply directly

      app.storageModule.replay = vi.fn();
      app.storageModule.resumeReplay = vi.fn();

      app.playReplay();

      expect(app.storageModule.replay).toHaveBeenCalledWith(app.currentSession, 1.5);
      expect(app.storageModule.resumeReplay).not.toHaveBeenCalled();
    });
  });
});
