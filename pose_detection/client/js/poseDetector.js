/**
 * Pose Detector Module
 * Wraps MediaPipe Pose Landmarker with a clean interface
 */

// Keypoint names in MediaPipe Pose order (33 landmarks)
export const KEYPOINT_NAMES = [
  'nose',
  'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear',
  'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky',
  'left_index', 'right_index',
  'left_thumb', 'right_thumb',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
  'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index'
];

/**
 * Convert normalized coordinates (0-1) to pixel coordinates
 * @param {number} normalizedX - X coordinate in 0-1 range
 * @param {number} normalizedY - Y coordinate in 0-1 range
 * @param {number} width - Canvas/video width in pixels
 * @param {number} height - Canvas/video height in pixels
 * @returns {{x: number, y: number}} Pixel coordinates
 */
export function normalizedToPixel(normalizedX, normalizedY, width, height) {
  return {
    x: Math.round(normalizedX * width),
    y: Math.round(normalizedY * height)
  };
}

/**
 * Convert pixel coordinates to normalized coordinates (0-1)
 * @param {number} pixelX - X coordinate in pixels
 * @param {number} pixelY - Y coordinate in pixels
 * @param {number} width - Canvas/video width in pixels
 * @param {number} height - Canvas/video height in pixels
 * @returns {{x: number, y: number}} Normalized coordinates
 */
export function pixelToNormalized(pixelX, pixelY, width, height) {
  return {
    x: pixelX / width,
    y: pixelY / height
  };
}

/**
 * Format raw MediaPipe landmarks into structured keypoint data
 * @param {Array} landmarks - Raw MediaPipe landmarks array
 * @param {Array} worldLandmarks - Raw MediaPipe world landmarks array (3D coordinates in meters)
 * @param {number} width - Video/canvas width for pixel conversion
 * @param {number} height - Video/canvas height for pixel conversion
 * @param {Object} coordinateConfig - Which coordinate systems to include
 * @returns {Object} Formatted pose data with normalized and/or pixel and/or world coordinates
 */
export function formatLandmarks(landmarks, worldLandmarks, width, height, coordinateConfig = { normalized: true, pixel: true, world: false }) {
  const result = {
    normalized: null,
    pixel: null,
    world: null
  };

  if (coordinateConfig.normalized) {
    result.normalized = landmarks.map((landmark, index) => ({
      index,
      name: KEYPOINT_NAMES[index],
      x: landmark.x,
      y: landmark.y,
      z: landmark.z,
      visibility: landmark.visibility ?? 0,
      presence: landmark.presence ?? 0
    }));
  }

  if (coordinateConfig.pixel) {
    result.pixel = landmarks.map((landmark, index) => {
      const pixel = normalizedToPixel(landmark.x, landmark.y, width, height);
      return {
        index,
        name: KEYPOINT_NAMES[index],
        x: pixel.x,
        y: pixel.y,
        z: landmark.z,
        visibility: landmark.visibility ?? 0,
        presence: landmark.presence ?? 0
      };
    });
  }

  // World coordinates from MediaPipe (3D coordinates in meters relative to camera)
  if (coordinateConfig.world && worldLandmarks) {
    result.world = worldLandmarks.map((landmark, index) => ({
      index,
      name: KEYPOINT_NAMES[index],
      x: landmark.x,  // meters
      y: landmark.y,  // meters
      z: landmark.z,  // meters (negative = away from camera)
      visibility: landmark.visibility ?? 0,
      presence: landmark.presence ?? 0
    }));
  }

  return result;
}

/**
 * PoseDetector class - wraps MediaPipe Pose Landmarker
 */
export class PoseDetector {
  constructor(config) {
    this.config = config;
    this.poseLandmarker = null;
    this.isInitialized = false;
    this.lastDetectionTime = 0;
    this.frameCount = 0;
    this.fps = 0;
    this.fpsUpdateInterval = 1000; // Update FPS every second
    this.lastFpsUpdate = 0;

    // Inference-time instrumentation. The MediaPipe call is the dominant term
    // in end-to-end pose latency, so we time just that call and report a
    // per-second average alongside FPS. `modelLabel` (lite|full|heavy) is
    // stamped into the log so a full-vs-lite A/B is unambiguous in the console.
    this.lastInferenceMs = 0;
    this.avgInferenceMs = 0;
    this.inferenceTimeSum = 0;
    const modelMatch = (config?.detector?.modelPath || '').match(/pose_landmarker_(\w+)\.task/);
    this.modelLabel = modelMatch ? modelMatch[1] : 'model';
  }

  /**
   * Initialize the MediaPipe Pose Landmarker
   * Must be called before detect()
   */
  async initialize() {
    // Dynamic import for browser environment
    const vision = await import('@mediapipe/tasks-vision');
    const { PoseLandmarker, FilesetResolver } = vision;

    // Load the vision WASM files. Pinned to the same version as the JS bundle
    // mapped in index.html's import map — a mismatch between the @latest WASM
    // and a pinned API bundle can fail at runtime.
    const wasmFiles = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
    );

    // Create the pose landmarker
    this.poseLandmarker = await PoseLandmarker.createFromOptions(wasmFiles, {
      baseOptions: {
        modelAssetPath: this.config.detector.modelPath,
        delegate: this.config.performance.enableGpu ? 'GPU' : 'CPU'
      },
      runningMode: this.config.detector.runningMode,
      numPoses: this.config.detector.numPoses,
      minPoseDetectionConfidence: this.config.detector.minDetectionConfidence,
      minPosePresenceConfidence: this.config.detector.minPosePresenceConfidence,
      minTrackingConfidence: this.config.detector.minTrackingConfidence
    });

    this.isInitialized = true;
    this.lastFpsUpdate = performance.now();
  }

  /**
   * Detect pose in an image or video frame
   * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} input - Input element
   * @param {number} timestamp - Timestamp in milliseconds (required for VIDEO/LIVE_STREAM mode)
   * @returns {Object} Pose detection result
   */
  detect(input, timestamp = performance.now()) {
    if (!this.isInitialized) {
      throw new Error('PoseDetector not initialized. Call initialize() first.');
    }

    // Get input dimensions
    const width = input.videoWidth || input.width;
    const height = input.videoHeight || input.height;

    // Run detection based on mode. Time JUST the inference call — this is the
    // expensive, latency-dominating step (formatting below is microseconds).
    const inferenceStart = performance.now();
    let results;
    if (this.config.detector.runningMode === 'IMAGE') {
      results = this.poseLandmarker.detect(input);
    } else {
      // VIDEO or LIVE_STREAM mode
      results = this.poseLandmarker.detectForVideo(input, timestamp);
    }
    this.lastInferenceMs = performance.now() - inferenceStart;

    // Update FPS + inference-time average (reported together once per second).
    this.frameCount++;
    this.inferenceTimeSum += this.lastInferenceMs;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.fps = (this.frameCount * 1000) / (now - this.lastFpsUpdate);
      this.avgInferenceMs = this.inferenceTimeSum / this.frameCount;
      // ASCII-only perf line so the lite-vs-full A/B reads cleanly in console.
      console.log(
        `[Perf] inference avg ${this.avgInferenceMs.toFixed(1)} ms ` +
        `(last ${this.lastInferenceMs.toFixed(1)} ms) | model ${this.modelLabel} | ${this.fps.toFixed(1)} FPS`
      );
      this.frameCount = 0;
      this.inferenceTimeSum = 0;
      this.lastFpsUpdate = now;
    }

    // Format results
    if (results.landmarks && results.landmarks.length > 0) {
      // Pose detected
      const worldLandmarks = results.worldLandmarks && results.worldLandmarks.length > 0
        ? results.worldLandmarks[0]
        : null;

      const pose = formatLandmarks(
        results.landmarks[0], // First (and only for MVP) pose
        worldLandmarks,       // World landmarks (3D coordinates in meters)
        width,
        height,
        this.config.coordinates
      );

      return {
        timestamp,
        fps: Math.round(this.fps * 10) / 10,
        inferenceMs: Math.round(this.lastInferenceMs * 10) / 10,
        detected: true,
        pose,
        width,
        height
      };
    } else {
      // No pose detected
      return {
        timestamp,
        fps: Math.round(this.fps * 10) / 10,
        inferenceMs: Math.round(this.lastInferenceMs * 10) / 10,
        detected: false,
        pose: null,
        width,
        height
      };
    }
  }

  /**
   * Close the pose landmarker and free resources
   */
  close() {
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
      this.isInitialized = false;
    }
  }

  /**
   * Check if detector is initialized
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Get current FPS
   */
  getFps() {
    return this.fps;
  }

  /**
   * Get the most recent single-frame inference time in milliseconds.
   * @returns {number} Last MediaPipe inference duration (ms)
   */
  getInferenceMs() {
    return this.lastInferenceMs;
  }

  /**
   * Update running mode (requires re-initialization in some cases)
   */
  async setRunningMode(mode) {
    if (!this.isInitialized) {
      throw new Error('PoseDetector not initialized');
    }

    if (!['IMAGE', 'VIDEO', 'LIVE_STREAM'].includes(mode)) {
      throw new Error(`Invalid running mode: ${mode}`);
    }

    this.config.detector.runningMode = mode;
    await this.poseLandmarker.setOptions({ runningMode: mode });
  }
}

export default PoseDetector;
