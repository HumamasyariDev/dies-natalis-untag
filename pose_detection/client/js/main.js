/**
 * Main entry point for MediaPipe Pose Detection
 * Sprint 6: Webcam Integration & Real-Time Processing
 * Sprint 8: Session Recording & Replay
 * Sprint 9: REST API & External Integration
 * Sprint 11: World Coordinates & Angle Calculations
 * Sprint 12: Gesture Recognition
 *
 * Orchestrates: config (/api/config) → PoseDetector → FilterPipeline → DataBus → DisplayModule → StorageModule → ApiModule → AngleCalculator → GestureDetector
 */

import { PoseDetector } from './poseDetector.js';
import { FilterPipeline } from './filterPipeline.js';
import { DataBus } from './dataBus.js';
import { DisplayModule } from './displayModule.js';
import { StorageModule } from './storageModule.js';
import { ApiModule } from './apiModule.js';
import { AngleCalculator } from './angleCalculator.js';
import { GestureDetector } from './gestureDetector.js';

class PoseDetectionApp {
  constructor() {
    this.config = null;
    this.detector = null;
    this.filterPipeline = null;
    this.dataBus = null;
    this.displayModule = null;
    this.storageModule = null; // Sprint 8
    this.apiModule = null; // Sprint 9
    this.angleCalculator = null; // Sprint 11
    this.gestureDetector = null; // Sprint 12

    this.videoElement = null;
    this.canvasElement = null;
    this.stream = null;

    this.isRunning = false;
    this.animationFrameId = null;
    this.videoFrameHandle = null; // requestVideoFrameCallback handle (preferred over rAF)
    this.lastFrameTime = 0;
    this.frameCount = 0;
    this._frameWorkSum = 0; // accumulated processFrame work time (ms) for the 1s perf log
    this._framePostSum = 0; // accumulated post-detect work time (ms)
    // rVFC diagnostic: VideoFrameCallbackMetadata.presentedFrames is a monotonic
    // count of frames the compositor has actually presented for the <video>.
    // Comparing its per-second delta to our callback count tells us whether a low
    // FPS is source/camera-bound (delta ~= callbacks) or us dropping presented
    // frames (delta >> callbacks). Null until the first rVFC frame with metadata.
    this._winStartPresentedFrames = null;
    this._lastPresentedFrames = null;
    this.fpsUpdateInterval = null;
    this.diagnosticsInterval = null; // Filter-tuning readout (lag/gap)

    // UI elements
    this.startBtn = null;
    this.stopBtn = null;
    this.modelSelect = null;
    this.resolutionSelect = null;
    this.frameRateSelect = null;
    this.cameraSelect = null;
    this.displayModeSelect = null;
    this.fpsDisplay = null;
    this.statusDisplay = null;

    // Sprint 8: Recording UI elements
    this.recordBtn = null;
    this.stopRecordBtn = null;
    this.saveJsonBtn = null;
    this.saveCsvBtn = null;
    this.recordingStatus = null;
    this.frameCountDisplay = null;
    this.detectionRateDisplay = null;

    // Sprint 8: Replay UI elements
    this.sessionSelect = null;
    this.loadSessionBtn = null;
    this.refreshSessionsBtn = null;
    this.replayBtn = null;
    this.pauseReplayBtn = null;
    this.stopReplayBtn = null;
    this.replaySpeed = null;
    this.replayStatus = null;
    this.replayProgressDisplay = null;

    // Sprint 8: Replay state
    this.currentSession = null;
    // Bus unsubscribe for the display while a session is replaying. The display
    // is normally only subscribed between start()/stop(); replay runs post-Stop,
    // so we re-subscribe it for the duration of playback (see setupReplayRendering).
    this.replayDisplayUnsub = null;
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      this.updateStatus('Initializing...');

      // Get UI elements
      this.videoElement = document.getElementById('webcam');
      this.canvasElement = document.getElementById('output-canvas');
      this.startBtn = document.getElementById('start-btn');
      this.stopBtn = document.getElementById('stop-btn');
      this.modelSelect = document.getElementById('model-select');
      this.resolutionSelect = document.getElementById('resolution-select');
      this.frameRateSelect = document.getElementById('frame-rate-select');
      this.cameraSelect = document.getElementById('camera-select');
      this.displayModeSelect = document.getElementById('display-mode');
      this.fpsDisplay = document.getElementById('fps-display');
      this.statusDisplay = document.getElementById('status-display');

      // Sprint 8: Get recording UI elements
      this.recordBtn = document.getElementById('record-btn');
      this.stopRecordBtn = document.getElementById('stop-record-btn');
      this.saveJsonBtn = document.getElementById('save-json-btn');
      this.saveCsvBtn = document.getElementById('save-csv-btn');
      this.recordingStatus = document.getElementById('recording-status');
      this.frameCountDisplay = document.getElementById('frame-count');
      this.detectionRateDisplay = document.getElementById('detection-rate');

      // Sprint 8: Get replay UI elements
      this.sessionSelect = document.getElementById('session-select');
      this.loadSessionBtn = document.getElementById('load-session-btn');
      this.refreshSessionsBtn = document.getElementById('refresh-sessions-btn');
      this.replayBtn = document.getElementById('replay-btn');
      this.pauseReplayBtn = document.getElementById('pause-replay-btn');
      this.stopReplayBtn = document.getElementById('stop-replay-btn');
      this.replaySpeed = document.getElementById('replay-speed');
      this.replayStatus = document.getElementById('replay-status');
      this.replayProgressDisplay = document.getElementById('replay-progress');

      // Load configuration
      this.config = await this.loadConfig();

      // Initialize Data Bus (central communication hub)
      this.dataBus = new DataBus();

      // Initialize Display Module
      this.displayModule = new DisplayModule(
        this.canvasElement,
        this.videoElement,
        this.config,
        this.dataBus
      );

      // Sprint 8: Initialize Storage Module
      if (this.config.storage) {
        this.storageModule = new StorageModule(this.dataBus, this.config.storage);
        this.setupStorageListeners();
      }

      // Sprint 8: Drive the output canvas during session replay. Depends only on
      // the Data Bus + display (both created above), not the storage module, so
      // it's wired unconditionally — if replay never happens the subscriptions
      // are inert.
      this.setupReplayRendering();

      // Sprint 9: Initialize API Module
      if (this.config.api) {
        this.apiModule = new ApiModule(this.dataBus, this.config);
        console.log('[Main] API Module initialized, forwarding:', this.config.api.enabled ? 'enabled' : 'disabled');
      }

      // Sprint 11: Initialize Angle Calculator
      if (this.config.angles) {
        this.angleCalculator = new AngleCalculator(this.dataBus, this.config.angles);
        console.log('[Main] Angle Calculator initialized, enabled:', this.config.angles.enabled !== false);
      }

      // Sprint 12: Initialize Gesture Detector
      if (this.config.gestures) {
        this.gestureDetector = new GestureDetector(this.dataBus, this.config.gestures);
        this.setupGestureListeners();
        console.log('[Main] Gesture Detector initialized, enabled:', this.config.gestures.enabled !== false);
      }

      // Set up UI event listeners
      this.setupUIListeners();

      // Filter-tuning console (raw overlay toggle, presets, live sliders)
      this.setupFilterTuningControls();

      // Populate the camera selector and keep it fresh as devices are plugged
      // in/out. Device labels are blank until camera permission is granted, so
      // we refresh again after the first successful getUserMedia (see initWebcam).
      await this.refreshCameras();
      if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
        navigator.mediaDevices.addEventListener('devicechange', () => this.refreshCameras());
      }

      // Subscribe to FPS updates from Data Bus
      this.dataBus.onFpsUpdate((data) => {
        this.fpsDisplay.textContent = `FPS: ${data.fps.toFixed(1)}`;
      });

      // Start watching for config changes
      this.watchConfig();

      // Sprint 8: Load available sessions
      this.refreshSessions();

      this.updateStatus('Ready');
      console.log('MediaPipe Pose Detection initialized successfully');

    } catch (error) {
      console.error('Initialization error:', error);
      this.updateStatus(`Error: ${error.message}`);
    }
  }

  /**
   * Load configuration from server
   */
  async loadConfig() {
    try {
      const response = await fetch('/api/config');
      if (!response.ok) {
        throw new Error('Failed to load configuration');
      }
      return await response.json();
    } catch (error) {
      console.error('Config load error:', error);
      // Return default config if server fails
      return this.getDefaultConfig();
    }
  }

  /**
   * Watch for configuration changes via Server-Sent Events
   */
  watchConfig() {
    // Connect to SSE endpoint for config updates
    const eventSource = new EventSource('/api/config/watch');

    eventSource.onopen = () => {
      console.log('Config watcher connected');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          console.log(data.message);
        } else if (data.type === 'config:changed') {
          console.log('Config changed, reloading...', data.timestamp);
          this.handleConfigChange(data.config);
        } else if (data.type === 'config:error') {
          console.error('Config error:', data.error);
          this.updateStatus(`Config error: ${data.error}`, 'error');
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // Don't retry immediately to avoid hammering the server
      eventSource.close();
      setTimeout(() => this.watchConfig(), 5000); // Retry after 5 seconds
    };

    // Store reference for cleanup
    this.configWatcher = eventSource;
  }

  /**
   * Handle configuration change event
   */
  handleConfigChange(newConfig) {
    this.config = newConfig;

    // Emit config changed event through Data Bus
    if (this.dataBus) {
      this.dataBus.emitConfigChanged(newConfig);
    }

    // Update display mode if changed
    if (this.displayModule && newConfig.display) {
      this.displayModule.setMode(newConfig.display.mode);
    }

    // Update status
    this.updateStatus('Configuration reloaded', 'success');

    // Note: For some config changes (like model or filter params),
    // a full restart may be needed. We just update what we can dynamically.
    console.log('Config updated. Some changes may require restarting detection.');
  }

  /**
   * Get default configuration (fallback)
   */
  getDefaultConfig() {
    return {
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
    };
  }

  /**
   * Set up UI event listeners
   */
  setupUIListeners() {
    this.startBtn.addEventListener('click', () => this.start());
    this.stopBtn.addEventListener('click', () => this.stop());

    this.modelSelect.addEventListener('change', (e) => {
      const modelType = e.target.value;
      this.config.detector.modelPath = `./models/pose_landmarker_${modelType}.task`;
      console.log(`Model changed to: ${modelType}`);
    });

    // Resolution lever. Value is "WxH" (e.g. "1280x720"). Applies on the next
    // Start (webcam constraints are set in initWebcam), mirroring the model
    // selector. Higher resolution trades frame rate: most webcams do 720p@60
    // but only 1080p@30, and the camera negotiates that against frameRate ideal.
    if (this.resolutionSelect) {
      this.resolutionSelect.addEventListener('change', (e) => {
        const [width, height] = e.target.value.split('x').map(Number);
        this.config.input = this.config.input || {};
        this.config.input.resolution = { width, height };
        console.log(`Resolution changed to: ${width}x${height} (applies on next Start)`);
      });
    }

    // Frame-rate lever. Value is a target fps ("30" | "60"). Applies on the next
    // Start (constraints are built in initWebcam). 30 = steady (advisory ideal,
    // holds 30 even in dim light); 60 = bright-light opt-in (forces a high-rate
    // mode, which auto-exposure can only sustain with ample light). See the
    // initWebcam comment for the full rationale.
    if (this.frameRateSelect) {
      this.frameRateSelect.addEventListener('change', (e) => {
        this.config.input = this.config.input || {};
        this.config.input.frameRate = Number(e.target.value);
        console.log(`Frame rate changed to: ${e.target.value} fps (applies on next Start)`);
      });
    }

    // Camera selector. Empty value = browser default (no deviceId pin). Applies
    // on the next Start, like model/resolution — Stop then Start to switch cams.
    if (this.cameraSelect) {
      this.cameraSelect.addEventListener('change', (e) => {
        this.config.input = this.config.input || {};
        this.config.input.deviceId = e.target.value || null;
        console.log(`Camera changed to: ${e.target.value || 'default'} (applies on next Start)`);
      });
    }

    this.displayModeSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      this.config.display.mode = mode;
      if (this.displayModule) {
        this.displayModule.setMode(mode);
      }
      console.log(`Display mode changed to: ${mode}`);
    });

    // Sprint 8: Recording controls
    if (this.recordBtn) {
      this.recordBtn.addEventListener('click', () => this.startRecording());
      this.stopRecordBtn.addEventListener('click', () => this.stopRecording());
      this.saveJsonBtn.addEventListener('click', () => this.saveSession('json'));
      this.saveCsvBtn.addEventListener('click', () => this.saveSession('csv'));
    }

    // Sprint 8: Replay controls
    if (this.replayBtn) {
      this.loadSessionBtn.addEventListener('click', () => this.loadSession());
      this.refreshSessionsBtn.addEventListener('click', () => this.refreshSessions());
      this.replayBtn.addEventListener('click', () => this.playReplay());
      this.pauseReplayBtn.addEventListener('click', () => this.pauseReplay());
      this.stopReplayBtn.addEventListener('click', () => this.stopReplay());
    }
  }

  /**
   * Wire up the filter-tuning console: the raw-vs-filtered overlay toggle, the
   * filtering on/off toggle, One-Euro presets, and live minCutoff/beta/dCutoff
   * sliders. The filterPipeline only exists after start(), so the filter
   * handlers guard on it; the overlay toggle works any time (display exists).
   */
  setupFilterTuningControls() {
    // Retuned toward responsiveness — the old set felt too heavy/laggy.
    // "smooth" is roughly the old "responsive"; "responsive" now tracks near-raw.
    const PRESETS = {
      responsive: { minCutoff: 15.0, beta: 3.0, dCutoff: 1.0 }, // near-raw, minimal lag
      balanced:   { minCutoff: 8.0,  beta: 1.6, dCutoff: 1.0 },
      smooth:     { minCutoff: 4.0,  beta: 0.6, dCutoff: 1.0 }  // heaviest, but kept light
    };

    const showRaw = document.getElementById('diag-show-raw');
    if (showRaw) {
      showRaw.addEventListener('change', (e) => {
        this.displayModule.setShowRaw(e.target.checked);
      });
    }

    const filterEnabled = document.getElementById('filter-enabled');
    if (filterEnabled) {
      filterEnabled.addEventListener('change', (e) => {
        this.config.filtering.enabled = e.target.checked;
        if (this.filterPipeline) {
          this.filterPipeline.setEnabled(e.target.checked);
        }
      });
    }

    const sliders = {
      minCutoff: document.getElementById('filter-mincutoff'),
      beta: document.getElementById('filter-beta'),
      dCutoff: document.getElementById('filter-dcutoff')
    };
    const labels = {
      minCutoff: document.getElementById('val-mincutoff'),
      beta: document.getElementById('val-beta'),
      dCutoff: document.getElementById('val-dcutoff')
    };

    // Reflect the loaded config on the sliders so they match the live filter
    // (decouples the displayed values from the static HTML defaults).
    const initialCfg = this.config.filtering?.oneEuroConfig || {};
    for (const key of Object.keys(sliders)) {
      if (sliders[key] && initialCfg[key] !== undefined) {
        sliders[key].value = initialCfg[key];
        if (labels[key]) labels[key].textContent = String(initialCfg[key]);
      }
    }

    const applyParam = (key, rawValue) => {
      const value = parseFloat(rawValue);
      if (Number.isNaN(value)) return;
      if (labels[key]) labels[key].textContent = String(value);
      this.config.filtering.oneEuroConfig = this.config.filtering.oneEuroConfig || {};
      this.config.filtering.oneEuroConfig[key] = value;
      if (this.filterPipeline) {
        this.filterPipeline.updateParams({ [key]: value });
      }
    };

    for (const [key, el] of Object.entries(sliders)) {
      if (el) el.addEventListener('input', (e) => applyParam(key, e.target.value));
    }

    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = PRESETS[btn.dataset.preset];
        if (!preset) return;
        for (const [key, value] of Object.entries(preset)) {
          if (sliders[key]) sliders[key].value = value;
          applyParam(key, value);
        }
      });
    });
  }

  /**
   * Push the latest filter-lag/gap diagnostics from the display module to the
   * readout in the Filter Tuning panel. Driven by a low-frequency interval
   * (the canvas itself redraws at frame rate) — see start()/stop().
   */
  updateDiagnosticsReadout() {
    if (!this.displayModule) return;
    const d = this.displayModule.getDiagnostics();
    const lagEl = document.getElementById('diag-lag');
    const gapEl = document.getElementById('diag-gap');
    if (lagEl) lagEl.textContent = d.showRaw ? `${d.lagMs.toFixed(0)} ms` : '—';
    if (gapEl) gapEl.textContent = d.showRaw ? `${d.gapPx.toFixed(0)} px` : '0 px';
  }

  /**
   * Start pose detection
   */
  async start() {
    if (this.isRunning) {
      console.warn('Detection already running');
      return;
    }

    try {
      this.updateStatus('Starting webcam...');
      this.startBtn.disabled = true;

      // Initialize webcam
      await this.initWebcam();

      this.updateStatus('Loading model...');

      // Initialize pose detector
      this.detector = new PoseDetector(this.config);
      await this.detector.initialize();

      // Initialize filter pipeline
      if (this.config.filtering.enabled) {
        this.filterPipeline = new FilterPipeline(this.config);
      }

      // Start display module
      this.displayModule.start();

      // Sprint 11: Start angle calculator
      if (this.angleCalculator) {
        this.angleCalculator.start();
      }

      this.isRunning = true;
      this.startBtn.disabled = true;
      this.stopBtn.disabled = false;
      this.updateStatus('Running');

      // Initialize FPS-counter state at start() rather than leaving
      // lastFrameTime = 0 from the constructor. With the old default,
      // the first frame's `elapsed` would be huge (performance.now()),
      // immediately tripping the >=1000ms branch and emitting a garbage
      // "fps: 0.2" event before any real data was available.
      this.lastFrameTime = performance.now();
      this.frameCount = 0;
      this._frameWorkSum = 0;
      this._framePostSum = 0;
      this._winStartPresentedFrames = null;
      this._lastPresentedFrames = null;

      // Start processing loop
      this.processFrame();

      // Drive the filter-tuning lag/gap readout at a low rate (the canvas
      // overlay itself redraws at frame rate).
      this.diagnosticsInterval = setInterval(() => this.updateDiagnosticsReadout(), 200);

      console.log('Pose detection started');

    } catch (error) {
      console.error('Start error:', error);
      this.updateStatus(`Error: ${error.message}`);
      this.startBtn.disabled = false;
      this.stopBtn.disabled = true;

      // Clean up on error
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
    }
  }

  /**
   * Enumerate connected video input devices and (re)populate the camera
   * selector. Defensive and best-effort: never throws, no-ops where the API or
   * the <select> is absent. Device labels are only populated by the browser
   * after camera permission has been granted, so this is called once at init
   * (counts/IDs available, labels possibly blank) and again after the first
   * getUserMedia (labels now present). Preserves the current selection.
   */
  async refreshCameras() {
    if (!this.cameraSelect || !navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === 'videoinput');
      if (cams.length === 0) return;

      const selected = this.config.input?.deviceId || this.cameraSelect.value || '';
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

      this.cameraSelect.innerHTML = cams.map((cam, i) => {
        const label = cam.label || `Camera ${i + 1}`;
        const sel = cam.deviceId === selected ? ' selected' : '';
        return `<option value="${esc(cam.deviceId)}"${sel}>${esc(label)}</option>`;
      }).join('');

      // `selected` in the markup doesn't always update a live <select>.value.
      if (selected && cams.some((c) => c.deviceId === selected)) {
        this.cameraSelect.value = selected;
      }
    } catch (err) {
      console.warn('[Camera] Could not enumerate devices:', err.message);
    }
  }

  /**
   * Initialize webcam access
   */
  async initWebcam() {
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      // Request webcam access.
      // Resolution comes from config (the UI lever). Frame rate is the other,
      // subtler lever: a high frame rate caps each frame's EXPOSURE time, so
      // forcing 60 fps indoors backfires — the camera's auto-exposure can't
      // gather enough light in ~16 ms and *halves* the capture rate (60 -> 30 ->
      // 15) to compensate. So we run two modes, chosen by `input.frameRate`:
      //   - Steady (default, 30): request the target only as an advisory `ideal`,
      //     never a `min`. The camera is free to lengthen exposure and HOLD 30
      //     even in dim light. The right default for typical indoor use.
      //   - Bright light (opt-in, 60): *force* a high-rate mode with a `min`
      //     above 30 — browsers otherwise hand back the default 30 even when a 60
      //     mode exists. Only sustains 60 with ample light; degrades to 30/15
      //     otherwise, which is why it is opt-in rather than the default.
      // Each mode tries exact resolution first, then loosens to ideal so cameras
      // lacking the exact mode still start. Pinning resolution (exact) stops a
      // forced frame rate from hijacking a *different* resolution (handing back
      // 720p60 for a 1080p pick). First success wins.
      const r = this.config.input?.resolution || { width: 1280, height: 720 };
      // Pin a specific camera when one is selected (deviceId exact); otherwise
      // fall back to the front-facing default. deviceId stays fixed across all
      // fallback tiers — only resolution/frame-rate loosen.
      const deviceId = this.config.input?.deviceId;
      const source = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' };
      const targetFps = this.config.input?.frameRate || 30;
      const exactRes = { width: { exact: r.width }, height: { exact: r.height } };
      const looseRes = { width: { ideal: r.width }, height: { ideal: r.height } };
      const attempts = targetFps >= 60
        ? [
            { ...source, ...exactRes, frameRate: { min: 45, ideal: 60 } },
            { ...source, ...exactRes, frameRate: { ideal: 60 } },
            { ...source, ...looseRes, frameRate: { ideal: 60 } }
          ]
        : [
            { ...source, ...exactRes, frameRate: { ideal: targetFps } },
            { ...source, ...looseRes, frameRate: { ideal: targetFps } }
          ];

      let lastError = null;
      for (const video of attempts) {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
          break;
        } catch (err) {
          lastError = err;
          // Only a constraint mismatch is worth a looser retry. Permission /
          // no-device / in-use errors are terminal — rethrow so the outer
          // handler maps them to a friendly message.
          if (err.name !== 'OverconstrainedError' && err.name !== 'ConstraintNotSatisfiedError') {
            throw err;
          }
        }
      }
      if (!this.stream) {
        throw lastError || new Error('Unable to acquire a camera stream');
      }

      // Report what the camera actually negotiated (and its ceiling) so the
      // 30-vs-60 question is answerable straight from the console.
      const videoTrack = this.stream.getVideoTracks ? this.stream.getVideoTracks()[0] : null;
      if (videoTrack && typeof videoTrack.getSettings === 'function') {
        const s = videoTrack.getSettings();
        console.log(`[Webcam] Negotiated ${s.width}x${s.height} @ ${Math.round(s.frameRate)} fps`);
        if (typeof videoTrack.getCapabilities === 'function') {
          const caps = videoTrack.getCapabilities();
          if (caps && caps.frameRate) {
            console.log(`[Webcam] Camera reports max ${caps.frameRate.max} fps at the negotiated resolution`);
          }
        }
        // Record which camera actually got used so the selector reflects the
        // active device (especially the browser's default on first run).
        if (s.deviceId && !this.config.input?.deviceId) {
          this.config.input = this.config.input || {};
          this.config.input.deviceId = s.deviceId;
        }
      }

      this.videoElement.srcObject = this.stream;

      // Wait for video metadata to load
      await new Promise((resolve, reject) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play();
          resolve();
        };
        this.videoElement.onerror = reject;

        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Video load timeout')), 5000);
      });

      // Set canvas size to match video
      this.canvasElement.width = this.videoElement.videoWidth;
      this.canvasElement.height = this.videoElement.videoHeight;

      // Drive the display container's aspect ratio from the camera's ACTUAL
      // negotiated resolution. The CSS hardcodes 4:3, which squishes any other
      // aspect (e.g. 16:9 720p) and pulls drawn keypoints off the body. The
      // canvas backing store already matches videoWidth/videoHeight, so matching
      // the container keeps the video and skeleton in lockstep at any resolution.
      const videoContainer = document.getElementById('video-container');
      if (videoContainer && this.videoElement.videoWidth && this.videoElement.videoHeight) {
        videoContainer.style.aspectRatio =
          `${this.videoElement.videoWidth} / ${this.videoElement.videoHeight}`;
      }

      console.log(`Webcam initialized: ${this.videoElement.videoWidth}x${this.videoElement.videoHeight}`);

      // Permission is now granted, so device labels are available — repopulate
      // the camera selector with real names (and highlight the active device).
      await this.refreshCameras();

    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error('Camera permission denied. Please allow camera access and try again.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        throw new Error('No camera found. Please connect a camera and try again.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        throw new Error('Camera is already in use by another application.');
      } else {
        throw new Error(`Webcam error: ${error.message}`);
      }
    }
  }

  /**
   * Process a single video frame
   * @param {VideoFrameCallbackMetadata|null} frameMetadata - rVFC metadata for
   *   the presented frame (null on the rAF fallback path and the initial call).
   */
  async processFrame(frameMetadata = null) {
    if (!this.isRunning) {
      return;
    }

    // rVFC diagnostic: remember how many frames the compositor has presented so
    // the 1s perf log can compare presented-frame throughput to our callback rate.
    if (frameMetadata && typeof frameMetadata.presentedFrames === 'number') {
      this._lastPresentedFrames = frameMetadata.presentedFrames;
      if (this._winStartPresentedFrames === null) {
        this._winStartPresentedFrames = frameMetadata.presentedFrames;
      }
    }

    try {
      const startTime = performance.now();

      // Detect pose in current frame
      // PoseDetector.detect() is synchronous, but we await to remain
      // tolerant of mocks that return promises.
      const detectionResult = await this.detector.detect(
        this.videoElement,
        startTime
      );
      const afterDetect = performance.now();

      // Apply filtering if enabled
      let processedResult = detectionResult;
      if (this.config.filtering.enabled && this.filterPipeline && detectionResult.detected) {
        processedResult = this.filterPipeline.process(detectionResult);
      }

      // Filter-tuning diagnostics: hand the display the raw (pre-filter) pose
      // so it can overlay raw vs filtered when the overlay is toggled on. Raw
      // stays off the Data Bus — it's a visualization aid, not pipeline data.
      if (this.displayModule) {
        this.displayModule.setRawPose(detectionResult);
      }

      // Emit to Data Bus
      if (processedResult.detected) {
        this.dataBus.emitPoseDetected(processedResult);
      } else {
        this.dataBus.emitPoseLost({ timestamp: startTime });
      }

      // Render-on-data: paint exactly once per processed frame, after the bus
      // emits so the filtered pose, the raw-overlay pose, and the freshly
      // computed angles are all in sync within this same frame. This replaces
      // the DisplayModule's old free-running requestAnimationFrame loop, which
      // ran a *second* time-base at display refresh (~60 Hz) and re-drew the
      // full canvas every tick regardless of new data. That loop contended with
      // the rVFC detect loop for the main thread/GPU and collapsed the frame
      // rate at high camera rates (720p60 dropped to ~15 fps), and wasted GPU on
      // duplicate-frame redraws. One render per detected frame removes both.
      if (this.displayModule) {
        this.displayModule.render();
      }

      // Calculate and emit FPS, plus per-frame work timing. `workMs` is the
      // synchronous cost of one processFrame (detect + filter + Data Bus
      // subscribers + the inline display render); `postMs` isolates everything
      // after detection. Now that rendering is inline (no separate rAF loop),
      // workMs is the true end-to-end per-frame cost: if it is far below the
      // frame *period* (1000/fps), the loop is idle-bound — waiting on
      // rVFC/compositor frame presentation — rather than CPU-bound here.
      this.frameCount++;
      const workEnd = performance.now();
      this._frameWorkSum += workEnd - startTime;
      this._framePostSum += workEnd - afterDetect;
      const elapsed = startTime - this.lastFrameTime;
      if (elapsed >= 1000) { // Update every second
        const fps = (this.frameCount * 1000) / elapsed;
        const avgWork = this._frameWorkSum / this.frameCount;
        const avgPost = this._framePostSum / this.frameCount;
        this.dataBus.emitFpsUpdate({ fps, timestamp: startTime });
        // Presented-frame throughput this window. If `presented` (frames the
        // compositor delivered) is ~= our `fps`, we're processing every frame
        // and the source/camera is the limiter; if it's ~2x our fps, we're
        // dropping every other presented frame (a loop/scheduling problem).
        let presentedNote = '';
        if (this._lastPresentedFrames !== null && this._winStartPresentedFrames !== null) {
          const presented = (this._lastPresentedFrames - this._winStartPresentedFrames) * 1000 / elapsed;
          presentedNote = ` | presented ${presented.toFixed(1)}/s`;
          this._winStartPresentedFrames = this._lastPresentedFrames;
        }
        console.log(`[Perf] frame work avg ${avgWork.toFixed(1)} ms (post-detect ${avgPost.toFixed(1)} ms) | ${fps.toFixed(1)} FPS${presentedNote}`);
        this.frameCount = 0;
        this._frameWorkSum = 0;
        this._framePostSum = 0;
        this.lastFrameTime = startTime;
      }

    } catch (error) {
      console.error('Frame processing error:', error);
      // Continue processing despite errors
    }

    // Schedule the next frame.
    this.scheduleNextFrame();
  }

  /**
   * Schedule the next processFrame tick. Prefers the video element's
   * requestVideoFrameCallback so detection runs exactly once per *presented*
   * camera frame: the freshest frame, no wasted inference on duplicate frames
   * (a 30 fps camera driven by a 60 Hz rAF loop re-infers every frame twice),
   * and roughly half the GPU load. Falls back to requestAnimationFrame where
   * rVFC is unavailable (Firefox, and the jsdom test environment).
   */
  scheduleNextFrame() {
    if (!this.isRunning) {
      return;
    }

    const video = this.videoElement;
    if (video && typeof video.requestVideoFrameCallback === 'function') {
      this.videoFrameHandle = video.requestVideoFrameCallback((now, metadata) => this.processFrame(metadata));
    } else {
      this.animationFrameId = requestAnimationFrame(() => this.processFrame());
    }
  }

  /**
   * Stop pose detection
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Cancel animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Cancel a pending video-frame callback (rVFC path)
    if (this.videoFrameHandle !== null && this.videoElement &&
        typeof this.videoElement.cancelVideoFrameCallback === 'function') {
      this.videoElement.cancelVideoFrameCallback(this.videoFrameHandle);
    }
    this.videoFrameHandle = null;

    // Stop the filter-tuning diagnostics readout interval
    if (this.diagnosticsInterval) {
      clearInterval(this.diagnosticsInterval);
      this.diagnosticsInterval = null;
    }

    // Stop webcam stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.videoElement.srcObject = null;
    }

    // Stop display module
    if (this.displayModule) {
      this.displayModule.stop();
    }

    // Sprint 11: Stop angle calculator
    if (this.angleCalculator) {
      this.angleCalculator.stop();
    }

    // Sprint 12: tear down gesture subscription + history so a fresh
    // start() doesn't carry stale debounce/motion state across sessions.
    if (this.gestureDetector) {
      this.gestureDetector.unsubscribeFromPose();
      this.gestureDetector.clearHistory();
    }

    // Reset UI
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
    this.fpsDisplay.textContent = 'FPS: --';
    this.updateStatus('Stopped');

    // Reset counters
    this.frameCount = 0;
    this.lastFrameTime = 0;

    console.log('Pose detection stopped');
  }

  /**
   * Update status display
   */
  updateStatus(message) {
    if (this.statusDisplay) {
      this.statusDisplay.textContent = `Status: ${message}`;
    }
  }

  // ===== Sprint 8: Session Recording & Replay Methods =====

  /**
   * Set up storage event listeners
   */
  setupStorageListeners() {
    if (!this.storageModule) return;

    // Update UI when recording starts
    this.dataBus.onSessionStarted(() => {
      this.recordBtn.disabled = true;
      this.stopRecordBtn.disabled = false;
      this.saveJsonBtn.disabled = true;
      this.saveCsvBtn.disabled = true;
      this.recordingStatus.textContent = 'Recording...';
      this.updateRecordingStats();
    });

    // Update UI when recording stops
    this.dataBus.onSessionStopped((data) => {
      this.recordBtn.disabled = false;
      this.stopRecordBtn.disabled = true;
      this.saveJsonBtn.disabled = false;
      this.saveCsvBtn.disabled = false;
      this.recordingStatus.textContent = `Stopped (${data.frameCount} frames)`;
    });

    // Update UI when session is saved
    this.dataBus.onSessionSaved((data) => {
      console.log(`Session saved: ${data.sessionId}`);
      this.updateStatus(`Session saved: ${data.sessionId}`);
      this.saveJsonBtn.disabled = true;
      this.saveCsvBtn.disabled = true;
      // Refresh session list
      this.refreshSessions();
    });

    // Update UI when session is loaded
    this.dataBus.onSessionLoaded((data) => {
      console.log(`Session loaded: ${data.sessionId}`);
      this.updateStatus(`Session loaded: ${data.sessionId}`);
      this.replayBtn.disabled = false;
      this.replayStatus.textContent = `Loaded: ${data.sessionId} (${data.frameCount} frames)`;
    });

    // Update UI when replay starts
    this.dataBus.onReplayStarted((data) => {
      this.replayBtn.disabled = true;
      this.pauseReplayBtn.disabled = false;
      this.stopReplayBtn.disabled = false;
      this.replayStatus.textContent = `Playing: ${data.sessionId}`;
    });

    // Update UI during replay
    this.dataBus.onReplayProgress((data) => {
      this.replayProgressDisplay.textContent = `Progress: ${data.progress.toFixed(1)}%`;
    });

    // Update UI when replay stops
    this.dataBus.onReplayStopped(() => {
      this.replayBtn.disabled = false;
      this.pauseReplayBtn.disabled = true;
      this.stopReplayBtn.disabled = true;
      this.replayStatus.textContent = 'Replay stopped';
      this.replayProgressDisplay.textContent = 'Progress: 0%';
    });

    // Update UI when replay is paused. Play is re-enabled so it can double as
    // Resume (see playReplay).
    this.dataBus.onReplayPaused(() => {
      this.replayBtn.disabled = false;
      this.pauseReplayBtn.disabled = true;
      this.replayStatus.textContent = 'Paused';
    });

    // Update UI when replay resumes — back to the playing state.
    this.dataBus.onReplayResumed(() => {
      this.replayBtn.disabled = true;
      this.pauseReplayBtn.disabled = false;
      this.stopReplayBtn.disabled = false;
      this.replayStatus.textContent = 'Playing';
    });

    // Update recording stats periodically
    setInterval(() => {
      if (this.storageModule && this.storageModule.recording) {
        this.updateRecordingStats();
      }
    }, 500); // Update twice per second
  }

  /**
   * Wire session replay to the output canvas.
   *
   * The live path renders via processFrame() -> displayModule.render(), once per
   * detected frame. Replay has no such loop: StorageModule.replay() re-emits the
   * recorded pose:detected / pose:lost events on the Data Bus from its own timer,
   * but after Stop the DisplayModule is unsubscribed (DisplayModule.stop()) and
   * nothing drives render() — so a loaded session never paints.
   *
   * Mirror the live contract for replay WITHOUT reintroducing a free-running rAF
   * loop (the contention the render-on-data refactor removed): re-subscribe the
   * display to the bus so currentPoseData tracks each replayed frame, and call
   * render() exactly once per frame off replay:progress, which replay() emits
   * immediately after each frame's pose event (so the pose is already fresh).
   * One progress event -> one render, on the replay timer's time-base.
   *
   * Guarded on !isRunning: during live detection the display is already
   * subscribed and driven by processFrame(); replay is a post-Stop activity.
   */
  setupReplayRendering() {
    if (!this.dataBus || !this.displayModule) return;

    this.dataBus.onReplayStarted(() => {
      if (this.isRunning || this.replayDisplayUnsub) return;
      // Reuse the display's bound bus handler. No resize/initial paint here, so a
      // canvas already sized by a prior live run is preserved for the replay.
      this.replayDisplayUnsub = this.dataBus.onPoseDetected(this.displayModule.onPoseData);
    });

    this.dataBus.onReplayProgress(() => {
      // The replay analog of processFrame()'s post-emit render(): one paint per
      // replayed frame, after that frame's pose event has refreshed the display.
      this.displayModule.render();
    });

    this.dataBus.onReplayStopped(() => {
      if (this.replayDisplayUnsub) {
        this.replayDisplayUnsub();
        this.replayDisplayUnsub = null;
      }
    });
  }

  /**
   * Update recording stats display
   */
  updateRecordingStats() {
    if (!this.storageModule) return;

    const status = this.storageModule.getStatus();
    this.frameCountDisplay.textContent = `Frames: ${status.frameCount}`;
    this.detectionRateDisplay.textContent = `Detection: ${(status.detectionRate * 100).toFixed(1)}%`;
  }

  /**
   * Setup gesture recognition listeners (Sprint 12)
   */
  setupGestureListeners() {
    if (!this.gestureDetector) return;

    // Listen for recognized gestures
    this.dataBus.onGestureRecognized((gestureData) => {
      console.log(`[Main] Gesture recognized: ${gestureData.name} (${(gestureData.confidence * 100).toFixed(0)}%)`);

      // Update UI if gesture display is enabled
      if (this.config.gestures?.showInUI !== false) {
        this.displayGesture(gestureData);
      }
    });
  }

  /**
   * Display recognized gesture in UI
   * @param {Object} gestureData - Gesture data
   */
  displayGesture(gestureData) {
    // Create or get gesture display element
    let gestureDisplay = document.getElementById('gesture-display');
    if (!gestureDisplay) {
      gestureDisplay = document.createElement('div');
      gestureDisplay.id = 'gesture-display';
      gestureDisplay.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 255, 0, 0.9);
        color: white;
        padding: 20px 40px;
        border-radius: 10px;
        font-size: 32px;
        font-weight: bold;
        text-align: center;
        z-index: 10000;
        pointer-events: none;
        animation: gesture-fade 2s ease-out forwards;
      `;
      document.body.appendChild(gestureDisplay);

      // Add CSS animation
      if (!document.getElementById('gesture-animation')) {
        const style = document.createElement('style');
        style.id = 'gesture-animation';
        style.textContent = `
          @keyframes gesture-fade {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
            10% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
            20% { transform: translate(-50%, -50%) scale(1); }
            80% { opacity: 1; }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
          }
        `;
        document.head.appendChild(style);
      }
    }

    // Update gesture display
    gestureDisplay.textContent = `${gestureData.description || gestureData.name}`;
    gestureDisplay.style.animation = 'none';

    // Trigger reflow to restart animation
    void gestureDisplay.offsetWidth;
    gestureDisplay.style.animation = 'gesture-fade 2s ease-out forwards';

    // Remove element after animation
    setTimeout(() => {
      if (gestureDisplay && gestureDisplay.parentNode) {
        gestureDisplay.parentNode.removeChild(gestureDisplay);
      }
    }, 2000);
  }

  /**
   * Start recording session
   */
  startRecording() {
    if (!this.storageModule) {
      alert('Storage module not available');
      return;
    }

    if (!this.isRunning) {
      alert('Please start pose detection first');
      return;
    }

    this.storageModule.startRecording();
  }

  /**
   * Stop recording session
   */
  stopRecording() {
    if (!this.storageModule) return;

    this.storageModule.stopRecording();
  }

  /**
   * Save session to file
   */
  async saveSession(format) {
    if (!this.storageModule) return;

    try {
      this.updateStatus(`Saving session as ${format.toUpperCase()}...`);
      const result = await this.storageModule.saveSession(format);
      console.log('Session saved:', result);
      this.updateStatus(`Session saved: ${result.filename}`);
    } catch (error) {
      console.error('Error saving session:', error);
      alert(`Failed to save session: ${error.message}`);
      this.updateStatus('Error saving session');
    }
  }

  /**
   * Load session from file
   */
  async loadSession() {
    if (!this.storageModule) return;

    const filename = this.sessionSelect.value;
    if (!filename) {
      alert('Please select a session to load');
      return;
    }

    try {
      this.updateStatus('Loading session...');
      this.currentSession = await this.storageModule.loadSession(filename);
      console.log('Session loaded:', this.currentSession);
    } catch (error) {
      console.error('Error loading session:', error);
      alert(`Failed to load session: ${error.message}`);
      this.updateStatus('Error loading session');
    }
  }

  /**
   * Refresh available sessions list
   */
  async refreshSessions() {
    if (!this.storageModule) return;

    try {
      const sessions = await this.storageModule.listSessions();

      // Clear and repopulate select
      this.sessionSelect.innerHTML = '<option value="">-- Select Session --</option>';

      if (sessions && sessions.sessions && sessions.sessions.length > 0) {
        sessions.sessions.forEach(session => {
          const option = document.createElement('option');
          option.value = session.filename;
          option.textContent = `${session.filename} (${(session.size / 1024).toFixed(1)} KB)`;
          this.sessionSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error refreshing sessions:', error);
    }
  }

  /**
   * Play replay. Doubles as Resume: while a replay is paused, this continues it
   * from where it left off rather than restarting — replay() would no-op because
   * this.storageModule.replaying is still true across a pause.
   */
  playReplay() {
    if (!this.storageModule || !this.currentSession) {
      alert('Please load a session first');
      return;
    }

    if (this.storageModule.replaying && this.storageModule.replayPaused) {
      this.storageModule.resumeReplay();
      return;
    }

    const speed = parseFloat(this.replaySpeed.value);
    this.storageModule.replay(this.currentSession, speed);
  }

  /**
   * Pause replay
   */
  pauseReplay() {
    if (!this.storageModule) return;

    this.storageModule.pauseReplay();
  }

  /**
   * Stop replay
   */
  stopReplay() {
    if (!this.storageModule) return;

    this.storageModule.stopReplay();
  }
}

// Initialize app when DOM is ready (only in browser environment)
let app;

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    console.log('MediaPipe Pose Detection - Sprint 6');
    app = new PoseDetectionApp();
    await app.init();
  });
}

// Export for testing
export { PoseDetectionApp };
