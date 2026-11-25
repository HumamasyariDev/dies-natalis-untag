/**
 * Display Module
 * Visualization and rendering for pose data
 */

import { KEYPOINT_NAMES } from './poseDetector.js';

/**
 * Skeleton connections - pairs of keypoint indices to draw lines between
 * Based on MediaPipe Pose connections
 */
export const SKELETON_CONNECTIONS = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7],   // Left eye path
  [0, 4], [4, 5], [5, 6], [6, 8],   // Right eye path
  [9, 10],                           // Mouth

  // Torso
  [11, 12],                          // Shoulders
  [11, 23], [12, 24],                // Shoulders to hips
  [23, 24],                          // Hips

  // Left arm
  [11, 13], [13, 15],                // Shoulder -> elbow -> wrist
  [15, 17], [15, 19], [15, 21],      // Wrist to hand
  [17, 19],                          // Pinky to index

  // Right arm
  [12, 14], [14, 16],                // Shoulder -> elbow -> wrist
  [16, 18], [16, 20], [16, 22],      // Wrist to hand
  [18, 20],                          // Pinky to index

  // Left leg
  [23, 25], [25, 27],                // Hip -> knee -> ankle
  [27, 29], [27, 31],                // Ankle to foot
  [29, 31],                          // Heel to toe

  // Right leg
  [24, 26], [26, 28],                // Hip -> knee -> ankle
  [28, 30], [28, 32],                // Ankle to foot
  [30, 32]                           // Heel to toe
];

/**
 * Landmarks used for the raw-vs-filtered "lag vector" in the filter-tuning
 * overlay: the fast-moving extremities (wrists + ankles) where smoothing lag is
 * most visible. (Pose analog of hand_detection's index-fingertip anchor.)
 */
export const RAW_LAG_ANCHORS = [15, 16, 27, 28];

/**
 * Display modes
 */
export const DisplayModes = {
  OVERLAY: 'overlay',
  STICK_FIGURE: 'stickFigure',
  KEYPOINTS: 'keypoints',
  NONE: 'none'
};

/**
 * DisplayModule class - Handles canvas rendering and visualization
 */
export class DisplayModule {
  /**
   * Create a display module
   * @param {HTMLCanvasElement} canvas - Canvas element for drawing
   * @param {HTMLVideoElement} videoElement - Video element (for overlay mode)
   * @param {Object} config - Display configuration
   * @param {Object} dataBus - Data bus for subscribing to pose data
   */
  constructor(canvas, videoElement, config, dataBus) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.videoElement = videoElement;
    this.config = config.display || {};
    this.dataBus = dataBus;
    this.anglesConfig = config.angles || {};

    this.mode = this.config.mode || DisplayModes.OVERLAY;
    this.enabled = this.config.enabled !== false;

    this.currentPoseData = null;
    this.currentAnglesData = null; // Sprint 11
    this.unsubscribe = null;
    this.unsubscribeAngles = null; // Sprint 11

    // Filter-tuning diagnostics: the raw (unfiltered) pose overlaid on the
    // filtered one so the smoothing effect is visible. Runtime-only, toggled
    // from the UI — no config flag (mirrors hand_detection).
    this.currentRawPoseData = null;
    this.diagnostics = {
      showRaw: false,
      lagMs: 0,
      gapPx: 0,
      _emaLag: null,
      _lastTime: 0,
      _lastRaw: {}
    };

    // Bind methods
    this.onPoseData = this.onPoseData.bind(this);
    this.onAnglesData = this.onAnglesData.bind(this);
  }

  /**
   * Initialize the display module and subscribe to data bus.
   *
   * Rendering is NOT self-driven here. The orchestrator (main.js) calls
   * render() once per processed frame, on the same time-base as detection
   * (requestVideoFrameCallback). This module used to run its own free-running
   * requestAnimationFrame loop at display refresh (~60 Hz), which re-drew the
   * full canvas every tick regardless of new data; that second time-base
   * contended with the detect loop and collapsed the frame rate at high camera
   * rates (e.g. 720p60 -> ~15 fps). The bus subscriptions below keep
   * currentPoseData/currentAnglesData fresh; render() paints them on demand.
   */
  start() {
    if (!this.enabled) {
      return;
    }

    // Subscribe to pose data events
    this.unsubscribe = this.dataBus.onPoseDetected(this.onPoseData);

    // Sprint 11: Subscribe to angles calculated events
    this.unsubscribeAngles = this.dataBus.onAnglesCalculated(this.onAnglesData);

    // Set canvas size to match video
    this.resizeCanvas();

    // Paint once now so the canvas isn't blank before the first frame arrives.
    this.render();
  }

  /**
   * Stop the display module and cleanup
   */
  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Sprint 11: Unsubscribe from angles events
    if (this.unsubscribeAngles) {
      this.unsubscribeAngles();
      this.unsubscribeAngles = null;
    }

    this.currentPoseData = null;
    this.currentAnglesData = null;
    this.currentRawPoseData = null;
    this.diagnostics._lastRaw = {};
    this.diagnostics._lastTime = 0;
    this.diagnostics._emaLag = null;

    // Clear canvas
    this.clearCanvas();
  }

  /**
   * Resize canvas to match video dimensions
   */
  resizeCanvas() {
    if (this.videoElement && this.videoElement.videoWidth > 0) {
      this.canvas.width = this.videoElement.videoWidth;
      this.canvas.height = this.videoElement.videoHeight;
    } else {
      // Default size
      this.canvas.width = 640;
      this.canvas.height = 480;
    }
  }

  /**
   * Handle incoming pose data from data bus
   * @param {Object} poseData - Pose data with detected poses
   */
  onPoseData(poseData) {
    this.currentPoseData = poseData;

    // Resize canvas if video dimensions changed
    if (poseData.width && poseData.height) {
      if (this.canvas.width !== poseData.width || this.canvas.height !== poseData.height) {
        this.canvas.width = poseData.width;
        this.canvas.height = poseData.height;
      }
    }
  }

  /**
   * Handle incoming angles data from data bus (Sprint 11)
   * @param {Object} anglesData - Angles data with calculated joint angles
   */
  onAnglesData(anglesData) {
    this.currentAnglesData = anglesData;
  }

  /**
   * Render the current frame
   */
  render() {
    if (!this.enabled || this.mode === DisplayModes.NONE) {
      return;
    }

    this.clearCanvas();

    // Draw based on mode
    switch (this.mode) {
      case DisplayModes.OVERLAY:
        this.renderOverlay();
        break;
      case DisplayModes.STICK_FIGURE:
        this.renderStickFigure();
        break;
      case DisplayModes.KEYPOINTS:
        this.renderKeypointsOnly();
        break;
    }

    // Filter-tuning diagnostics, drawn on top of whatever the mode rendered.
    if (this.diagnostics.showRaw) {
      this.renderRawOverlay();
    }
  }

  /**
   * Clear the canvas
   */
  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render overlay mode (webcam + pose overlay)
   */
  renderOverlay() {
    const overlayConfig = this.config.overlay || {};

    // Draw webcam feed if enabled
    if (overlayConfig.showWebcam && this.videoElement) {
      this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
    }

    // Draw pose if detected
    if (this.currentPoseData && this.currentPoseData.detected) {
      const keypoints = this.currentPoseData.pose.pixel || this.currentPoseData.pose.normalized;

      if (overlayConfig.showSkeleton) {
        this.drawSkeleton(keypoints, overlayConfig);
      }

      if (overlayConfig.showKeypoints) {
        this.drawKeypoints(keypoints, overlayConfig);
      }

      // Sprint 11: Draw angles if enabled
      if (this.anglesConfig.showInUI !== false && this.currentAnglesData) {
        this.drawAngles(keypoints, this.currentAnglesData.angles);
      }
    }
  }

  /**
   * Render stick figure mode (clean skeleton on black background)
   */
  renderStickFigure() {
    const stickConfig = this.config.stickFigure || {};

    // Fill background
    this.ctx.fillStyle = stickConfig.backgroundColor || '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw pose if detected
    if (this.currentPoseData && this.currentPoseData.detected) {
      const keypoints = this.currentPoseData.pose.pixel || this.currentPoseData.pose.normalized;

      // Draw skeleton
      this.drawSkeleton(keypoints, {
        lineWidth: 3,
        lineColor: stickConfig.figureColor || '#00FF00',
        confidenceColorCoding: false
      });

      if (stickConfig.showKeypoints) {
        this.drawKeypoints(keypoints, {
          radius: 5,
          fillColor: stickConfig.figureColor || '#00FF00',
          confidenceColorCoding: false
        });
      }

      // Sprint 11: Draw angles if enabled
      if (this.anglesConfig.showInUI !== false && this.currentAnglesData) {
        this.drawAngles(keypoints, this.currentAnglesData.angles);
      }
    }
  }

  /**
   * Render keypoints only mode (dots without skeleton)
   */
  renderKeypointsOnly() {
    const keypointsConfig = this.config.keypoints || {};

    if (this.currentPoseData && this.currentPoseData.detected) {
      const keypoints = this.currentPoseData.pose.pixel || this.currentPoseData.pose.normalized;

      this.drawKeypoints(keypoints, {
        radius: keypointsConfig.radius || 5,
        fillColor: '#00FF00',
        strokeColor: '#FFFFFF',
        lineWidth: 2,
        confidenceColorCoding: false
      });
    }
  }

  /**
   * Draw skeleton connections
   * @param {Array} keypoints - Array of keypoint objects
   * @param {Object} style - Style configuration
   */
  drawSkeleton(keypoints, style = {}) {
    const lineWidth = style.lineWidth || 2;
    const baseColor = style.lineColor || '#00FF00';

    this.ctx.lineWidth = lineWidth;

    for (const [startIdx, endIdx] of SKELETON_CONNECTIONS) {
      const start = keypoints[startIdx];
      const end = keypoints[endIdx];

      if (!start || !end) continue;

      // Skip if visibility too low
      const minVisibility = 0.3;
      if (start.visibility < minVisibility || end.visibility < minVisibility) {
        continue;
      }

      // Color by confidence if enabled
      if (style.confidenceColorCoding) {
        const avgConfidence = (start.visibility + end.visibility) / 2;
        this.ctx.strokeStyle = this.confidenceToColor(avgConfidence);
      } else {
        this.ctx.strokeStyle = baseColor;
      }

      this.ctx.beginPath();
      this.ctx.moveTo(start.x, start.y);
      this.ctx.lineTo(end.x, end.y);
      this.ctx.stroke();
    }
  }

  /**
   * Draw keypoints as dots
   * @param {Array} keypoints - Array of keypoint objects
   * @param {Object} style - Style configuration
   */
  drawKeypoints(keypoints, style = {}) {
    const radius = style.radius || 5;
    const fillColor = style.fillColor || '#00FF00';
    const strokeColor = style.strokeColor || '#FFFFFF';
    const lineWidth = style.lineWidth || 2;

    for (const keypoint of keypoints) {
      if (!keypoint) continue;

      // Skip if visibility too low
      const minVisibility = 0.3;
      if (keypoint.visibility < minVisibility) {
        continue;
      }

      // Color by confidence if enabled
      if (style.confidenceColorCoding) {
        this.ctx.fillStyle = this.confidenceToColor(keypoint.visibility);
      } else {
        this.ctx.fillStyle = fillColor;
      }

      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = lineWidth;

      this.ctx.beginPath();
      this.ctx.arc(keypoint.x, keypoint.y, radius, 0, 2 * Math.PI);
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  /**
   * Draw joint angles on the canvas (Sprint 11)
   * @param {Array} keypoints - Array of keypoint objects
   * @param {Object} angles - Object with angle values
   */
  drawAngles(keypoints, angles) {
    if (!angles) return;

    // Mapping of angle names to keypoint indices (vertex of the angle)
    const anglePositions = {
      left_elbow: 13,
      right_elbow: 14,
      left_knee: 25,
      right_knee: 26,
      left_hip: 23,
      right_hip: 24,
      left_shoulder: 11,
      right_shoulder: 12,
      left_ankle: 27,
      right_ankle: 28
    };

    // Text style
    this.ctx.font = 'bold 16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Draw each angle
    for (const [angleName, angleValue] of Object.entries(angles)) {
      if (angleValue === null || angleValue === undefined) continue;

      const keypointIdx = anglePositions[angleName];
      if (keypointIdx === undefined) continue;

      const keypoint = keypoints[keypointIdx];
      if (!keypoint || keypoint.visibility < 0.5) continue;

      // Position text slightly offset from the joint
      const offsetX = 20;
      const offsetY = -10;
      const textX = keypoint.x + offsetX;
      const textY = keypoint.y + offsetY;

      // Draw text background for readability
      const text = `${Math.round(angleValue)}°`;
      const metrics = this.ctx.measureText(text);
      const padding = 4;
      const bgX = textX - metrics.width / 2 - padding;
      const bgY = textY - 8 - padding;
      const bgWidth = metrics.width + padding * 2;
      const bgHeight = 16 + padding * 2;

      // Semi-transparent black background
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

      // Draw angle text in cyan
      this.ctx.fillStyle = '#00FFFF';
      this.ctx.fillText(text, textX, textY);
    }
  }

  /**
   * Filter-tuning overlay: draw the raw (unfiltered) pose superimposed on the
   * filtered one so the smoothing effect is visible. Raw landmarks are cyan
   * hollow rings + a faint skeleton; a yellow "lag vector" connects the raw and
   * filtered positions of the fast-moving extremities (wrists/ankles), where
   * filter lag shows up most. Drawn on top of the normal (filtered) skeleton.
   */
  renderRawOverlay() {
    const raw = this.currentRawPoseData;
    if (!raw || !raw.detected || !raw.pose) return;

    const rawKp = raw.pose.pixel || raw.pose.normalized;
    if (!rawKp) return;

    const filtered = this.currentPoseData;
    const filtKp = filtered && filtered.detected && filtered.pose
      ? (filtered.pose.pixel || filtered.pose.normalized)
      : null;

    const RAW_COLOR = '#00E5FF'; // cyan = raw (what the camera sees right now)
    const LAG_COLOR = '#FFD400'; // yellow = lag vector / filtered marker
    const minVis = 0.3;

    // Faint raw skeleton
    this.ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    this.ctx.lineWidth = 1.5;
    for (const [startIdx, endIdx] of SKELETON_CONNECTIONS) {
      const a = rawKp[startIdx];
      const b = rawKp[endIdx];
      if (!a || !b) continue;
      if (a.visibility < minVis || b.visibility < minVis) continue;
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(b.x, b.y);
      this.ctx.stroke();
    }

    // Hollow raw landmark rings
    this.ctx.strokeStyle = RAW_COLOR;
    this.ctx.lineWidth = 1.5;
    for (const p of rawKp) {
      if (!p || p.visibility < minVis) continue;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
      this.ctx.stroke();
    }

    // Lag vectors on the fast-moving extremities (wrists + ankles)
    if (filtKp) {
      for (const idx of RAW_LAG_ANCHORS) {
        const r = rawKp[idx];
        const f = filtKp[idx];
        if (!r || !f) continue;
        if (r.visibility < minVis || f.visibility < minVis) continue;

        this.ctx.strokeStyle = LAG_COLOR;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(r.x, r.y);
        this.ctx.lineTo(f.x, f.y);
        this.ctx.stroke();

        this.ctx.strokeStyle = RAW_COLOR;
        this.ctx.beginPath();
        this.ctx.arc(r.x, r.y, 7, 0, 2 * Math.PI);
        this.ctx.stroke();

        this.ctx.fillStyle = LAG_COLOR;
        this.ctx.beginPath();
        this.ctx.arc(f.x, f.y, 4, 0, 2 * Math.PI);
        this.ctx.fill();
      }
    }

    this.updateLag(rawKp, filtKp);
  }

  /**
   * Estimate filter lag from the fastest-moving anchor: lag(ms) ~= gap / speed.
   * Only updates while the anchor is actually moving (speed above a threshold)
   * so a still subject doesn't report jitter. EMA-smoothed for a steady read.
   * @param {Array} rawKp - Raw (unfiltered) pixel keypoints
   * @param {Array|null} filtKp - Filtered pixel keypoints (may be null)
   */
  updateLag(rawKp, filtKp) {
    const now = (this.currentRawPoseData && this.currentRawPoseData.timestamp) ||
      (typeof performance !== 'undefined' ? performance.now() : 0);
    const dt = this.diagnostics._lastTime ? (now - this.diagnostics._lastTime) / 1000 : 0;
    this.diagnostics._lastTime = now;

    let bestSpeed = 0;
    let bestGap = 0;
    for (const idx of RAW_LAG_ANCHORS) {
      const r = rawKp[idx];
      if (!r) continue;
      const last = this.diagnostics._lastRaw[idx];
      this.diagnostics._lastRaw[idx] = { x: r.x, y: r.y };
      const f = filtKp && filtKp[idx];
      if (!last || dt <= 0 || !f) continue;
      const speed = Math.hypot(r.x - last.x, r.y - last.y) / dt; // px/s
      if (speed > bestSpeed) {
        bestSpeed = speed;
        bestGap = Math.hypot(r.x - f.x, r.y - f.y);
      }
    }

    this.diagnostics.gapPx = bestGap;
    if (bestSpeed > 80) {
      const lag = (bestGap / bestSpeed) * 1000;
      this.diagnostics._emaLag = this.diagnostics._emaLag == null
        ? lag
        : this.diagnostics._emaLag * 0.8 + lag * 0.2;
      this.diagnostics.lagMs = this.diagnostics._emaLag;
    }
  }

  /**
   * Store the latest raw (pre-filter) pose for the diagnostics overlay.
   * @param {Object} rawPoseData - Unfiltered pose data from the detector
   */
  setRawPose(rawPoseData) {
    this.currentRawPoseData = rawPoseData;
  }

  /**
   * Enable/disable the raw-vs-filtered diagnostics overlay.
   * @param {boolean} enabled
   */
  setShowRaw(enabled) {
    this.diagnostics.showRaw = !!enabled;
    if (!enabled) {
      this.diagnostics._emaLag = null;
      this.diagnostics.lagMs = 0;
      this.diagnostics.gapPx = 0;
      this.diagnostics._lastRaw = {};
      this.diagnostics._lastTime = 0;
    }
  }

  /**
   * Current diagnostics snapshot for the UI readout.
   * @returns {{showRaw: boolean, lagMs: number, gapPx: number}}
   */
  getDiagnostics() {
    return {
      showRaw: this.diagnostics.showRaw,
      lagMs: this.diagnostics.lagMs,
      gapPx: this.diagnostics.gapPx
    };
  }

  /**
   * Convert confidence value to color (green = high, red = low)
   * @param {number} confidence - Confidence value (0-1)
   * @returns {string} Color string
   */
  confidenceToColor(confidence) {
    // Red (low) to yellow to green (high)
    if (confidence > 0.7) {
      return '#00FF00'; // Green
    } else if (confidence > 0.4) {
      return '#FFFF00'; // Yellow
    } else {
      return '#FF0000'; // Red
    }
  }

  /**
   * Set display mode
   * @param {string} mode - Display mode
   */
  setMode(mode) {
    if (!Object.values(DisplayModes).includes(mode)) {
      throw new Error(`Invalid display mode: ${mode}`);
    }

    this.mode = mode;
  }

  /**
   * Get current display mode
   * @returns {string} Current mode
   */
  getMode() {
    return this.mode;
  }

  /**
   * Enable or disable display
   * @param {boolean} enabled - Whether display is enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;

    if (!enabled) {
      this.clearCanvas();
    }
  }

  /**
   * Check if display is enabled
   * @returns {boolean} Whether display is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Update display configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };

    if (config.mode) {
      this.setMode(config.mode);
    }

    if (config.enabled !== undefined) {
      this.setEnabled(config.enabled);
    }
  }

  /**
   * Get current display configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }
}

export default DisplayModule;
